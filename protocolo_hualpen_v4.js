/**
 * SISTEMA DE SUPERVIGILANCIA SATELITAL - PENÍNSULA DE HUALPÉN
 * Versión: 4.4.4 (Edición para Repositorio Público)
 * * DESCRIPCIÓN GEOGRÁFICA:
 * Implementación de un análisis de series temporales (TSA) para la detección de 
 * quiebres estructurales en la cobertura vegetal. El sistema utiliza una 
 * normalización fenológica basada en Z-Score para aislar perturbaciones 
 * antrópicas de la variabilidad climática natural.
 * * ----------------------------------------------------------------------------
 * LICENCIA: MIT License
 * Copyright (c) 2026 [TU NOMBRE / DIMAE HUALPÉN]
 * * Se concede permiso por la presente, de forma gratuita, a cualquier persona que 
 * obtenga una copia de este software y de los archivos de documentación asociados 
 * para utilizar, copiar, modificar, fusionar, publicar, distribuir, sublicenciar 
 * y/o vender copias del Software, sujeto a la inclusión del aviso de copyright 
 * anterior y este aviso de permiso en todas las copias o partes sustanciales.
 * ----------------------------------------------------------------------------
 */

// ============================================================================
// 1. CONFIGURACIÓN DEL USUARIO
// ============================================================================

// Indique la fecha del monitoreo (Formato: AAAA-MM-DD)
var fechaConsulta = ee.Date('2026-03-02'); 

// ============================================================================
// 2. PARÁMETROS TÉCNICOS INTERNOS
// ============================================================================

var intervaloDias = 14; 
var santuario = ee.FeatureCollection("projects/consummate-web-485614-v3/assets/shape_extension_peninsula");
Map.centerObject(santuario, 14);

// Normalización Fenológica (Día del Año / Day of Year)
var doy = fechaConsulta.getRelative('day', 'year').add(1); 
var doyStart = doy.subtract(10);
var doyEnd = doy.add(10);

var filtroDOY = ee.Filter.and(
  ee.Filter.dayOfYear(doyStart.max(1).min(366), doyEnd.max(1).min(366))
);

// Gestión de transiciones anuales para el filtro histórico
if (doyStart.getInfo() < 1 || doyEnd.getInfo() > 366) {
  filtroDOY = ee.Filter.or(
    ee.Filter.dayOfYear(doyStart.add(366).mod(366).max(1), 366),
    ee.Filter.dayOfYear(1, doyEnd.mod(366).max(1))
  );
}

// ============================================================================
// 3. FUNCIONES DE PROCESAMIENTO ESPECTRAL
// ============================================================================

function prepararImagen(image) {
  // Uso de Scene Classification Layer (SCL) para depuración atmosférica
  var scl = image.select('SCL');
  var mascaraNubes = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));

  var imgEscalada = image.updateMask(mascaraNubes).divide(10000);

  // EVI (Enhanced Vegetation Index) - Optimizado para alta densidad de biomasa
  var evi = imgEscalada.expression(
    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      'NIR': imgEscalada.select('B8'), 
      'RED': imgEscalada.select('B4'), 
      'BLUE': imgEscalada.select('B2')
    }).rename('EVI');
    
  var mndwi = imgEscalada.normalizedDifference(['B3', 'B11']).rename('MNDWI');

  return imgEscalada.addBands(evi).addBands(mndwi)
              .copyProperties(image, ['system:time_start']);
}

// ============================================================================
// 4. PROCESAMIENTO ESTADÍSTICO (LÍNEA BASE 2016-2024)
// ============================================================================

var historialBase = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                .filterBounds(santuario)
                .filter(ee.Filter.calendarRange(2016, 2024, 'year'))
                .filter(filtroDOY)
                .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) 
                .map(prepararImagen);

var promedioHistorico = historialBase.select('EVI').mean();
var desviacionHistorica = historialBase.select('EVI').reduce(ee.Reducer.stdDev());

var calcularZ = function(img) {
  var z = img.select('EVI').subtract(promedioHistorico).divide(desviacionHistorica);
  return z.rename('Z_Score').copyProperties(img, ['system:time_start']);
};

// ============================================================================
// 5. EVALUACIÓN DE PERSISTENCIA TEMPORAL (ACTUAL VS PREVIA)
// ============================================================================

var colActual = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                .filterBounds(santuario)
                .filterDate(fechaConsulta.advance(-intervaloDias, 'day'), fechaConsulta.advance(1, 'day'))
                .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
                .map(prepararImagen);

var colPrevia = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                .filterBounds(santuario)
                .filterDate(fechaConsulta.advance(-intervaloDias * 2, 'day'), fechaConsulta.advance(-intervaloDias, 'day'))
                .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
                .map(prepararImagen);

var zActual = colActual.map(calcularZ).median().clip(santuario);
var zPrevia = colPrevia.map(calcularZ).median().clip(santuario);

var mascaraAgua = colActual.median().normalizedDifference(['B3', 'B11']).lt(0.05); 
var mascaraVegetacion = promedioHistorico.gt(0.12); 

var alertaActual = zActual.updateMask(zActual.lt(-1.5)).updateMask(mascaraAgua).updateMask(mascaraVegetacion);
var alertaPrevia = zPrevia.updateMask(zPrevia.lt(-1.5)).updateMask(mascaraAgua).updateMask(mascaraVegetacion);

// ============================================================================
// 6. INTERFAZ Y VISUALIZACIÓN INSTITUCIONAL
// ============================================================================

var paletaOficial = ['#67000d', '#cb181d', '#fb6a4a', '#fcae91']; 

Map.addLayer(colActual.median(), {bands:['B4','B3','B2'], min:0, max:0.3}, '1. Referencia Visual (Sentinel-2)', true);
Map.addLayer(alertaPrevia, {min: -7, max: -1.5, palette: paletaOficial}, '2. Anomalías Periodo Anterior', true, 0.4); 
Map.addLayer(alertaActual, {min: -7, max: -1.5, palette: paletaOficial}, '3. Anomalías Periodo Actual', true);

var panelInspector = ui.Panel([], ui.Panel.Layout.flow('vertical'), {
  width: '450px', position: 'bottom-left', padding: '12px'
});
panelInspector.add(ui.Label('Análisis Técnico de Anomalías', {fontWeight: 'bold', fontSize: '18px'}));
Map.add(panelInspector);

Map.onClick(function(coords) {
  panelInspector.clear();
  var punto = ee.Geometry.Point(coords.lon, coords.lat);
  Map.layers().set(4, ui.Map.Layer(punto, {color: 'FF00FF'}, 'Punto de Análisis'));

  var valorZ = zActual.reduceRegion(ee.Reducer.first(), punto, 10).get('Z_Score');
  
  valorZ.evaluate(function(val) {
    var severidad = 'Normalidad';
    if (val < -5.0) severidad = 'CRÍTICA (Z < -5.0)';
    else if (val < -3.0) severidad = 'GRAVE (-3.0 a -5.0)';
    else if (val < -2.0) severidad = 'MEDIA (-2.0 a -3.0)';
    else if (val < -1.5) severidad = 'BAJA (-1.5 a -2.0)';

    panelInspector.add(ui.Label('Diagnóstico en Fecha de Consulta:', {fontWeight: 'bold'}));
    panelInspector.add(ui.Label('Z-Score: ' + (val ? val.toFixed(2) : 'N/A') + ' | Categoría: ' + severidad, {
      color: val < -3 ? '#cb181d' : '#333', fontWeight: 'bold'
    }));
  });

  var inicioVentanaActual = fechaConsulta.advance(-intervaloDias, 'day').millis();
  var finVentanaActual = fechaConsulta.advance(1, 'day').millis();
  var hoy = ee.Date(Date.now());

  var serieTotal = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(punto)
    .filterDate(fechaConsulta.advance(-5, 'year'), hoy) 
    .map(prepararImagen)
    .map(function(img) {
      var z = img.select('EVI').subtract(promedioHistorico).divide(desviacionHistorica);
      var m = img.date().millis();
      
      var esHistoria = m.lt(inicioVentanaActual);
      var esConsulta = m.gte(inicioVentanaActual).and(m.lte(finVentanaActual));
      var esSeguimiento = m.gt(finVentanaActual);
      
      var zH = z.updateMask(esHistoria).rename('Z_Historia');
      var zC = z.updateMask(esConsulta).rename('Z_Consulta');
      var zS = z.updateMask(esSeguimiento).rename('Z_Seguimiento');
      
      return ee.Image([zH, zC, zS]).copyProperties(img, ['system:time_start']);
    });

  var chart = ui.Chart.image.series(serieTotal.select(['Z_Historia', 'Z_Consulta', 'Z_Seguimiento']), punto, ee.Reducer.mean(), 20)
    .setOptions({
      title: 'HISTORIAL DE COMPORTAMIENTO (5 AÑOS)',
      vAxis: {title: 'Anomalía (Z-Score)', viewWindow: {min: -8, max: 2}},
      lineWidth: 0, pointSize: 3, legend: {position: 'none'},
      series: { 0: {color: '#884ea0'}, 1: {color: '#d73027'}, 2: {color: '#ff9900'} }
    });
  
  panelInspector.add(chart);

  var leyendaGrafico = ui.Panel([], ui.Panel.Layout.flow('vertical'), {margin: '10px 0 10px 0'});
  var filaGrafico = function(color, texto) {
    var icon = ui.Label('●', {color: color, fontSize: '20px', margin: '0 8px 0 0'});
    var label = ui.Label(texto, {fontSize: '12px', margin: '4px 0 0 0'});
    return ui.Panel([icon, label], ui.Panel.Layout.flow('horizontal'));
  };

  leyendaGrafico.add(filaGrafico('#884ea0', 'Historial Previo (Morado)'));
  leyendaGrafico.add(filaGrafico('#d73027', 'Periodo de Consulta (Rojo)'));
  leyendaGrafico.add(filaGrafico('#ff9900', 'Seguimiento Posterior (Naranja)'));
  panelInspector.add(leyendaGrafico);
});

// ============================================================================
// 7. EXPORTACIÓN DEL RÁSTER DE ANOMALÍAS (Z-SCORE)
// ============================================================================

Export.image.toDrive({
  image: zActual.toFloat(),
  description: 'Anomalia_ZScore_Hualpen_' + fechaConsulta.format('YYYY-MM-dd').getInfo(),
  scale: 10, region: santuario.geometry(), fileFormat: 'GeoTIFF'
});
