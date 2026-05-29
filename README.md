# Space Atlas 🌌

The free, independent astrophotography planning companion officially recognized and endorsed by DWARFLAB for the DWARF telescope community (supporting DWARF II, DWARF 3, and DWARF mini PRO workflows).

🚀 **Live App:** https://euphonious-kelpie-b07604.netlify.app/  
📘 **Technical Manual & User Guide:** https://relaxed-crisp-6ff37c.netlify.app/

---

## 🌟 Official Endorsement
⭐ **Space Atlas** is an independent community tool officially recommended, supported, and promoted by DWARFLAB to their global user community.

---

## 🛠️ Predictive Features & Smart Automation (Upgraded to v1.3)

Space Atlas goes beyond standard calculators by acting as an atmospheric, environmental, and hardware-aware predictive assistant to protect your imaging sessions from common field errors:

* 🧠 **Adaptive Exposure & Anti-Washout Engine (New in v1.3):** The core calculation engine automatically cross-references your local Bortle scale with precise Lunar phase elongation algorithms (`lunaPhase()`). If the moon is too bright or light pollution is heavy, the app triggers an *Aggressive Optimization* routine to dynamically scale down exposure times and gain, preventing stacked frame whiteouts.
* 🔒 **Hardware-Enforced Structural Safety Floors (New in v1.3):** To prevent the optimization engine from dropping exposures too low under heavy light pollution, the backend strictly enforces hardware safety floors based on deep-sky target classifications to protect faint structural details:
    * **Galaxies:** Hard minimum floor of **10 seconds**.
    * **Nebulae / Planetary Remnants:** Hard minimum floor of **10 seconds**.
    * **Star Clusters (Open/Globular):** Hard minimum floor of **5 seconds**.
* 🎯 **Firmware Snapping Layer (New in v1.3):** All adaptive calculations are dynamically rounded and snapped to match the strict discrete step intervals allowed by the DWARF firmware (`ALLOWED_EXPOSURE` arrays up to 60s and `ALLOWED_GAIN` in steps of 10), outputting 100% production-ready values.
* 📊 **Advanced Sky Quality Model:** Computes Astronomical Seeing (1-5 scale) and Sky Transparency dynamically from your coordinates. It evaluates atmospheric stability and automatically outputs real-time suitability badges (e.g., *Excellent night*, *Marginal night*).
* 📍 **Smart Location & Automatic Bortle:** Features a 3-tier location pipeline (Predefined dark sites, GPS Geolocation API, and Manual overrides) paired with an internal distance heuristic that estimates your local Bortle scale instantly without external map lookups.
* 🛑 **Milky Way Core Blockers:** Built-in conditional safeguards that alert you via dynamic UI banners if the galactic core is invisible due to seasonal constraints, high Bortle scales (> 4), or bright moon illumination (> 30%).
* ⏱️ **Hardware & Storage Predictors:**
    * **Time-Lapse:** Predicts exact frame counts, total session duration, speed-up ratios, and required storage (GB) before you deploy, alongside an anti-flicker setup checklist.
    * **Star Trails:** Calculates target frames using ceiling math to avoid short trailing arcs, tracks directional alignment vectors, and provides empirical battery consumption heuristics (warning if external power is mandatory).
* ⚙️ **Workflow & Post-Processing Integration:** Features direct targeting links to Stellarium Web and Astrobin. The active Session Log and CSV Export engine automatically inject technical post-processing notes tailored for seamless **Siril**, **GraXpert (AI background cleaning)**, and **StarStaX (Gap Filling mode)** integration.
* 🔒 **Privacy First & PWA Ready:** 100% free, open-source, no login required, no ads, and no data collection. Fully optimized as a Progressive Web App to work offline in the field.

---

## 📬 Feedback & Suggestions

Suggestions for new target presets, UI refinements, or predictive feature formulas are highly welcome! Feel free to open an Issue or submit a Pull Request right here on GitHub.

Clear skies! 🌌✨
