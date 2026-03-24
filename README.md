# Satellite Surveillance System — Hualpén Peninsula Protected Area

**Time Series Anomaly Detection for Environmental Enforcement**
*Google Earth Engine | Sentinel-2 | EVI Z-Score*

---

## About

This script implements a semi-automated satellite monitoring system designed to support environmental enforcement in the Hualpén Peninsula Nature Sanctuary (Biobío Region, Chile), a 2,662-hectare protected area declared under Supreme Decree Nº 556/1976.

The system was developed to address a fundamental limitation of ground-based inspection: in a territory of this scale and topographic complexity, reactive patrolling cannot ensure systematic spatial coverage or generate comparable time-series evidence. This tool shifts the enforcement model from reactive to preventive, enabling early detection of vegetation cover anomalies consistent with unauthorized anthropogenic interventions — such as irregular land clearing, biomass removal, road openings or unauthorized construction — before they consolidate into irreversible damage.

The code is operationally integrated into the **Satellite Surveillance Protocol of the Hualpén Peninsula Protected Area**, an institutional instrument of the Municipal Directorate of Environment and Ecotourism (DIMAE), Municipality of Hualpén.

## Methodology

The detection logic draws on the conceptual framework of **BFAST** (Breaks For Additive Seasonal and Trend) for structural break detection in vegetation time series (Verbesselt et al., 2010), adapted into a computationally efficient implementation suitable for weekly operational monitoring.

### Core pipeline

1. **Phenologically homologous baseline.** A historical reference (2017–2024) is built by filtering Sentinel-2 imagery to a ±10-day window around the Day of Year (DOY) of the query date, isolating the expected seasonal behavior of each pixel and neutralizing phenological confounders.

2. **Standardized anomaly (Z-Score) on EVI.** The Enhanced Vegetation Index (Huete et al., 2002) is computed using its canonical formulation. A Z-Score is then calculated against the historical mean and standard deviation, expressing how exceptional the current observation is relative to the pixel's own phenological memory.

3. **Quality control filters.** Scene Classification Layer (SCL) masking removes cloud shadows, clouds, cirrus and snow/ice. A Modified Normalized Difference Water Index (MNDWI < 0.05) filter (Xu, 2006) excludes water-dominated pixels. A minimum historical vegetation mask (EVI > 0.12) restricts detection to surfaces with consistent photosynthetic signal.

4. **Temporal persistence evaluation.** Two consecutive 14-day windows (current and prior) are compared against the baseline, allowing differentiation between recent anomalies and pre-existing or persistent disturbances.

5. **Severity classification.** Anomalies are classified into four levels: Critical (Z < −5.0), Severe (−3.0 to −5.0), Moderate (−2.0 to −3.0), and Low (−1.5 to −2.0). These thresholds serve as operational alert tiers, not legal determinations.

6. **Expert validation.** All statistical alerts are mandatorily validated through multispectral photointerpretation in QGIS (True Color and False Color Infrared composites), ensuring no finding enters the administrative record without human expert review.

### What this system does not do

This is a detection and prioritization tool. It does not autonomously declare infractions, replace field inspection, or substitute the competence of sectoral enforcement agencies. Its output is a technically grounded, traceable, and reproducible preliminary antecedent — designed to focus administrative review and support institutional coordination.

## Severity scale

| Level | Z-Score | Interpretation |
|-------|---------|----------------|
| **Critical** | < −5.0 | Total structural break. Massive biomass removal or bare soil exposure. Extremely unlikely from climatic causes alone. |
| **Severe** | −3.0 to −5.0 | Major canopy or dense vegetation disturbance. Priority range for new anthropogenic intervention identification. |
| **Moderate** | −2.0 to −3.0 | Alert zone — may indicate extreme water stress or incipient degradation. Requires trend validation and detailed photointerpretation. |
| **Low** | −1.5 to −2.0 | Edge-of-range variability, intervention edge effects, or early vigor loss. |

## Data sources

- **Imagery:** [COPERNICUS/S2_SR_HARMONIZED](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED) — Sentinel-2 MSI Level-2A Surface Reflectance (10 m, 5-day revisit)
- **Platform:** [Google Earth Engine](https://earthengine.google.com/)
- **Validation environment:** QGIS + Sentinel Hub plugin

## Usage

```javascript
// Set the monitoring date (format: YYYY-MM-DD)
var fechaConsulta = ee.Date('2026-03-02');
```

Run the script in the [GEE Code Editor](https://code.earthengine.google.com/). Click any pixel on the map to inspect its 5-year Z-Score trajectory and severity classification.

## References

DeVries, B., Verbesselt, J., Kooistra, L., & Herold, M. (2015). Robust monitoring of small-scale forest disturbances in a tropical montane forest using Landsat time series. *Remote Sensing of Environment, 161*, 107–121. https://doi.org/10.1016/j.rse.2015.02.012

Gorelick, N., Hancher, M., Dixon, M., Ilyushchenko, S., Thau, D., & Moore, R. (2017). Google Earth Engine: Planetary-scale geospatial analysis for everyone. *Remote Sensing of Environment, 202*, 18–27. https://doi.org/10.1016/j.rse.2017.06.031

Huete, A., Didan, K., Miura, T., Rodriguez, E. P., Gao, X., & Ferreira, L. G. (2002). Overview of the radiometric and biophysical performance of the MODIS vegetation indices. *Remote Sensing of Environment, 83*(1–2), 195–213. https://doi.org/10.1016/S0034-4257(02)00096-2

Verbesselt, J., Hyndman, R. J., Newnham, G., & Culvenor, D. (2010). Detecting trend and seasonal changes in satellite image time series. *Remote Sensing of Environment, 114*(1), 106–115. https://doi.org/10.1016/j.rse.2009.08.014

Watts, L. M., & Laffan, S. W. (2014). Effectiveness of the BFAST algorithm for detecting vegetation response patterns in a semi-arid region. *Remote Sensing of Environment, 154*, 234–245. https://doi.org/10.1016/j.rse.2014.08.023

Xu, H. (2006). Modification of normalised difference water index (NDWI) to enhance open water features in remotely sensed imagery. *International Journal of Remote Sensing, 27*(14), 3025–3033. https://doi.org/10.1080/01431160600589179

## License

MIT License — see [LICENSE](LICENSE) for details.

## Author

**Sebastián Berríos Muñoz**
GIS & Spatial Analysis Advisor | Lic. Geography
Directorate of Environment and Ecotourism — Municipality of Hualpén, Chile
