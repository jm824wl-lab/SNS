"""デモ用: 業者から送られてくる物件PDF(マイソク)を模したPDFを生成する。"""

import os

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

PDF_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_data", "property_flyer.pdf")

FLYER_LINES = [
    "物件名: リバーサイド新宿",
    "種別: 賃貸マンション",
    "所在地: 東京都新宿区西新宿4-5-6",
    "最寄駅: 西新宿駅 徒歩7分",
    "間取り: 1K",
    "専有面積: 24.8㎡",
    "築年数: 築5年",
    "賃料: 98,000円",
    "管理費: 4,000円",
    "担当: 新宿リアルティ株式会社 田中次郎",
]


def generate_seed_pdf() -> str:
    if os.path.exists(PDF_PATH):
        return PDF_PATH

    pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
    c = canvas.Canvas(PDF_PATH, pagesize=A4)
    width, height = A4

    c.setFont("HeiseiKakuGo-W5", 16)
    c.drawString(50, height - 60, "物件のご案内")

    c.setFont("HeiseiKakuGo-W5", 11)
    y = height - 100
    for line in FLYER_LINES:
        c.drawString(50, y, line)
        y -= 22

    c.save()
    return PDF_PATH


if __name__ == "__main__":
    print(generate_seed_pdf())
