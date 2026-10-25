import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import spiceypy as spice

ROOT = Path(__file__).parent
KERNELS = ["naif0012.tls", "pck00011.tpc", "de440s.bsp"]
OUT = ROOT / "data" / "positions.json"

J2000 = datetime(2000, 1, 1, 12, 0, tzinfo=timezone.utc)
START = datetime(1995, 1, 1, 0, 0, tzinfo=timezone.utc)
END   = datetime(2055, 12, 31, 23, 0, tzinfo=timezone.utc)

def main():
    for k in KERNELS:
        spice.furnsh(str(ROOT / "data" / k))

    radii = spice.bodvrd("MOON", "RADII", 3)[1]
    radius_equatorial = radii[0]
    flattening = (radii[0] - radii[2]) / radii[0]
    rad2deg = spice.dpr()

    records = []
    dt = START
    while dt <= END:
        et = spice.str2et(dt.strftime("%Y-%m-%dT%H:%M:%S"))

        sun_iau, _ = spice.spkezr("SUN", et, "IAU_MOON", "NONE", "MOON")
        earth_iau, _ = spice.spkezr("EARTH", et, "IAU_MOON", "NONE", "MOON")

        dist_sun = spice.vnorm(sun_iau[:3])
        dist_earth = spice.vnorm(earth_iau[:3])

        # Ángulo de fase
        phase_rad = spice.vsep(sun_iau[:3], earth_iau[:3])
        phase_deg = float(phase_rad * rad2deg)

        # Subpunto solar (el mediodía lunar)
        subpnt_pos, _, _ = spice.subpnt("NEAR POINT: ELLIPSOID", "MOON", et, "IAU_MOON", "NONE", "SUN")
        _, lon_sub, lat_sub = spice.recpgr("MOON", subpnt_pos, radius_equatorial, flattening)

        records.append({
            "t": int((dt - J2000).total_seconds()),
            "sun":   [round(float(x), 3) for x in sun_iau[:3]],
            "earth": [round(float(x), 3) for x in earth_iau[:3]],
            "d_sun": round(float(dist_sun), 1),
            "d_earth": round(float(dist_earth), 1),
            "phase": round(phase_deg, 2),
            "sub_lat": round(float(lat_sub * rad2deg), 2),
            "sub_lon": round(float(lon_sub * rad2deg), 2),
        })
        dt += timedelta(hours=1)

    with open(OUT, "w") as f:
        json.dump(records, f, separators=(",", ":"))

    print(f"Generados {len(records)} registros limpios -> {OUT}")

if __name__ == "__main__":
    main()