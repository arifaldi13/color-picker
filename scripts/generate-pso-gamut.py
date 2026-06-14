from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageCms


ROOT = Path(__file__).resolve().parents[1]
PROFILES = [
    {
        "icc_path": Path(r"C:\Users\Rifaldi\Downloads\PSOcoated_v3.icc"),
        "out_path": ROOT / "src" / "data" / "psoCoatedV3Gamut.ts",
        "export_name": "psoCoatedV3Gamut",
    },
    {
        "icc_path": Path(r"C:\Users\Rifaldi\Downloads\PSOuncoated_v3_FOGRA52.icc"),
        "out_path": ROOT / "src" / "data" / "psoUncoatedV3Gamut.ts",
        "export_name": "psoUncoatedV3Gamut",
    },
]

L_STEPS = 51
H_STEPS = 72
MAX_CHROMA = 0.45
BINARY_STEPS = 12
DELTA_E_LIMIT = 2.25


def oklch_to_lab_d50(l_ok: float, c_ok: float, h_deg: float) -> tuple[float, float, float]:
    h = math.radians(h_deg)
    a_ok = math.cos(h) * c_ok
    b_ok = math.sin(h) * c_ok

    l_ = l_ok + 0.3963377774 * a_ok + 0.2158037573 * b_ok
    m_ = l_ok - 0.1055613458 * a_ok - 0.0638541728 * b_ok
    s_ = l_ok - 0.0894841775 * a_ok - 1.2914855480 * b_ok

    l = l_**3
    m = m_**3
    s = s_**3

    x_d65 = 1.2270138511 * l - 0.5577999807 * m + 0.2812561490 * s
    y_d65 = -0.0405801784 * l + 1.1122568696 * m - 0.0716766787 * s
    z_d65 = -0.0763812845 * l - 0.4214819784 * m + 1.5861632204 * s

    # Bradford-adapt XYZ from D65 (OKLab) to D50 (ICC PCS).
    x = 1.0479298208405488 * x_d65 + 0.022946793341019088 * y_d65 - 0.05019222954313557 * z_d65
    y = 0.029627815688159344 * x_d65 + 0.990434484573249 * y_d65 - 0.01707382502938514 * z_d65
    z = -0.009243058152591178 * x_d65 + 0.015055144896577895 * y_d65 + 0.7518742899580008 * z_d65

    white_x, white_y, white_z = 0.96422, 1.0, 0.82521
    delta = 6 / 29

    def f(t: float) -> float:
        return math.copysign(abs(t) ** (1 / 3), t) if t > delta**3 else t / (3 * delta**2) + 4 / 29

    fx = f(x / white_x)
    fy = f(y / white_y)
    fz = f(z / white_z)

    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def lab_to_pixel(lab: tuple[float, float, float]) -> tuple[int, int, int]:
    l_star, a_star, b_star = lab
    return (
        max(0, min(255, round(l_star / 100 * 255))),
        max(0, min(255, round(a_star + 128))),
        max(0, min(255, round(b_star + 128))),
    )


def pixel_to_lab(pixel: tuple[int, int, int]) -> tuple[float, float, float]:
    l_byte, a_byte, b_byte = pixel
    return l_byte / 255 * 100, a_byte - 128, b_byte - 128


def delta_e(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


class PsoGamut:
    def __init__(self, icc_path: Path) -> None:
        if not icc_path.exists():
            raise FileNotFoundError(f"ICC profile not found: {icc_path}")

        lab_profile = ImageCms.createProfile("LAB")
        pso_profile = ImageCms.getOpenProfile(str(icc_path))
        intent = ImageCms.Intent.RELATIVE_COLORIMETRIC
        flags = ImageCms.Flags.BLACKPOINTCOMPENSATION
        self.to_cmyk = ImageCms.buildTransformFromOpenProfiles(
            lab_profile, pso_profile, "LAB", "CMYK", renderingIntent=intent, flags=flags
        )
        self.to_lab = ImageCms.buildTransformFromOpenProfiles(
            pso_profile, lab_profile, "CMYK", "LAB", renderingIntent=intent, flags=flags
        )

    def check_batch(self, samples: list[tuple[float, float, float]]) -> list[bool]:
        pixels = [lab_to_pixel(oklch_to_lab_d50(*sample)) for sample in samples]
        img = Image.new("LAB", (len(pixels), 1))
        img.putdata(pixels)
        cmyk = ImageCms.applyTransform(img, self.to_cmyk)
        roundtrip = ImageCms.applyTransform(cmyk, self.to_lab)
        returned = list(roundtrip.getdata())

        results: list[bool] = []
        for original, transformed in zip(pixels, returned, strict=True):
            original_lab = pixel_to_lab(original)
            transformed_lab = pixel_to_lab(transformed)
            results.append(delta_e(original_lab, transformed_lab) <= DELTA_E_LIMIT)
        return results


def generate_profile(icc_path: Path, out_path: Path, export_name: str) -> None:
    checker = PsoGamut(icc_path)
    rows: list[list[float]] = []

    for l_index in range(L_STEPS):
        l_ok = l_index / (L_STEPS - 1)
        lows = [0.0 for _ in range(H_STEPS)]
        highs = [MAX_CHROMA for _ in range(H_STEPS)]
        hues = [h_index * 360 / H_STEPS for h_index in range(H_STEPS)]

        for _ in range(BINARY_STEPS):
            mids = [(low + high) / 2 for low, high in zip(lows, highs, strict=True)]
            checks = checker.check_batch(
                [(l_ok, mid, hue) for mid, hue in zip(mids, hues, strict=True)]
            )
            for h_index, ok in enumerate(checks):
                if ok:
                    lows[h_index] = mids[h_index]
                else:
                    highs[h_index] = mids[h_index]

        row = [round(value, 5) for value in lows]

        rows.append(row)
        print(f"{export_name}: L {l_index + 1:02d}/{L_STEPS} done")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": str(icc_path),
        "lSteps": L_STEPS,
        "hSteps": H_STEPS,
        "maxChroma": MAX_CHROMA,
        "deltaELimit": DELTA_E_LIMIT,
        "rows": rows,
    }
    out_path.write_text(
        f"export const {export_name} = "
        + json.dumps(payload, separators=(",", ":"))
        + " as const;\n",
        encoding="utf-8",
    )


def main() -> None:
    for profile in PROFILES:
        generate_profile(
            icc_path=profile["icc_path"],
            out_path=profile["out_path"],
            export_name=profile["export_name"],
        )


if __name__ == "__main__":
    main()
