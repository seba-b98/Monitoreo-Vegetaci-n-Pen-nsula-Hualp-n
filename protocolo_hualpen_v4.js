/**
 * SISTEMA DE SUPERVIGILANCIA SATELITAL - PENÍNSULA DE HUALPÉN
 * Versión: 4.4.4 (Edición Final para GitHub)
 * Desarrollado por: Sebastián Berríos Muñoz
 * * * DESCRIPCIÓN GEOGRÁFICA:
 * Implementación de un análisis de series temporales (TSA) para la detección de 
 * quiebres estructurales en la cobertura vegetal. El sistema utiliza una 
 * normalización fenológica basada en Z-Score para aislar perturbaciones 
 * antrópicas de la variabilidad climática natural.
 * * * ----------------------------------------------------------------------------
 * LICENCIA: MIT License
 * Copyright (c) 2026 Sebastián Berríos Muñoz
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

var doy = fechaConsulta.getRelative('day', 'year').add(1); 
var doyStart = doy.subtract(10);
var doyEnd = doy.add(10);

var filtroDOY = ee.Filter.and(
  ee.Filter.dayOfYear(doyStart.max(1).min(366), doyEnd.max(1).min(366))
);

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
  var scl = image.select('SCL');
  var mascaraNubes = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  var imgEscalada = image.updateMask(mascaraNubes).divide(10000);

  var evi = imgEscalada.expression(
    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      'NIR': imgEscalada.select('B8'), 
      'RED': imgEscalada.select('B4'), 
      'BLUE': imgEscalada.select('B2')
    }).rename('EVI');
    
  var mndwi = imgEscalada.normalizedDifference(['B3', 'B11']).rename('MNDWI');
  return imgEscalada.addBands(evi).addBands(mndwi).copyProperties(image, ['system:time_start']);
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
// 5. EVALUACIÓN DE PERSISTENCIA TEMPORAL
// ============================================================================

var colActual = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                .filterBounds(santuario)
                .filterDate(fechaConsulta.advance(-intervaloDias, 'day'), fechaConsulta.advance(1, 'day'))
                .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
                .map(prepararImagen);

var zActual = colActual.map(calcularZ).median().clip(santuario);
var mascaraAgua = colActual.median().normalizedDifference(['B3', 'B11']).lt(0.05); 
var mascaraVegetacion = promedioHistorico.gt(0.12); 

var alertaActual = zActual.updateMask(zActual.lt(-1.5)).updateMask(mascaraAgua).updateMask(mascaraVegetacion);

// ============================================================================
// 6. INTERFAZ Y VISUALIZACIÓN
// ============================================================================

var paletaOficial = ['#67000d', '#cb181d', '#fb6a4a', '#fcae91']; 

Map.addLayer(colActual.median(), {bands:['B4','B3','B2'], min:0, max:0.3}, '1. Color Natural', true);
Map.addLayer(alertaActual, {min: -7, max: -1.5, palette: paletaOficial}, '2. Anomalías Periodo Actual', true);

var panelInspector = ui.Panel([], ui.Panel.Layout.flow('vertical'), {
  width: '450px', position: 'bottom-left', padding: '12px'
});
panelInspector.add(ui.Label('Inspección Técnica de Anomalías', {fontWeight: 'bold', fontSize: '18px'}));
panelInspector.add(ui.Label('Autor: Sebastián Berríos Muñoz', {fontSize: '10px', color: 'gray'}));
Map.add(panelInspector);

Map.onClick(function(coords) {
  panelInspector.clear();
  panelInspector.add(ui.Label('Análisis de Tendencia Histórica', {fontWeight: 'bold'}));
  var punto = ee.Geometry.Point(coords.lon, coords.lat);
  Map.layers().set(2, ui.Map.Layer(punto, {color: 'FF00FF'}, 'Punto de Análisis'));

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
      var zH = z.updateMask(m.lt(inicioVentanaActual)).rename('Z_Historia');
      var zC = z.updateMask(m.gte(inicioVentanaActual).and(m.lte(finVentanaActual))).rename('Z_Consulta');
      var zS = z.updateMask(m.gt(finVentanaActual)).rename('Z_Seguimiento');
      return ee.Image([zH, zC, zS]).copyProperties(img, ['system:time_start']);
    });

  var chart = ui.Chart.image.series(serieTotal.select(['Z_Historia', 'Z_Consulta', 'Z_Seguimiento']), punto, ee.Reducer.mean(), 20)
    .setOptions({
      title: 'HISTORIAL DE COMPORTAMIENTO (5 AÑOS)',
      vAxis: {title: 'Z-Score', viewWindow: {min: -8, max: 2}},
      lineWidth: 0, pointSize: 3, legend: {position: 'none'},
      series: { 0: {color: '#884ea0'}, 1: {color: '#d73027'}, 2: {color: '#ff9900'} }
    });
  
  panelInspector.add(chart);
  
  var leyendaGrafico = ui.Panel([], ui.Panel.Layout.flow('vertical'), {margin: '10px 0'});
  var filaG = function(c, t) {
    return ui.Panel([ui.Label('●', {color: c, fontSize: '20px'}), ui.Label(t, {fontSize: '12px', margin: '4px 0 0 8px'})], ui.Panel.Layout.flow('horizontal'));
  };
  leyendaGrafico.add(filaG('#884ea0', 'Historial (Morado)'))
                .add(filaG('#d73027', 'Análisis (Rojo)'))
                .add(filaG('#ff9900', 'Seguimiento (Naranja)'));
  panelInspector.add(leyendaGrafico);
});

// EXPORTACIÓN
Export.image.toDrive({
  image: zActual.toFloat(),
  description: 'Anomalia_ZScore_Berrios_' + fechaConsulta.format('YYYY-MM-dd').getInfo(),
  scale: 10, region: santuario.geometry(), fileFormat: 'GeoTIFF'
});
