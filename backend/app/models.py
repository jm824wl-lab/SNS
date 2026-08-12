from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from .database import Base


class Property(Base):
    __tablename__ = "properties"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String, nullable=False, default="(物件名不明)")
    transaction_type = Column(String, nullable=True)  # 賃貸 / 売買
    property_type = Column(String, nullable=True)  # マンション / 戸建て / 土地 etc.
    status = Column(String, nullable=False, default="募集中")

    price_label = Column(String, nullable=True)  # 表示用の価格・賃料文字列
    price_yen = Column(Integer, nullable=True)  # 比較・ソート用の数値(円)

    address = Column(String, nullable=True)
    access = Column(String, nullable=True)  # 最寄駅・徒歩分数
    layout = Column(String, nullable=True)  # 間取り
    area_sqm = Column(Float, nullable=True)  # 専有面積
    built_year = Column(String, nullable=True)  # 築年数

    agent_name = Column(String, nullable=True)  # 送信元業者

    land_tsubo_label = Column(String, nullable=True)  # 土地面積(坪)
    building_tsubo_label = Column(String, nullable=True)  # 建物面積(坪)
    structure = Column(String, nullable=True)  # 構造(RC造5階建 等)
    units = Column(String, nullable=True)  # 総戸数(全14戸 等)
    yield_label = Column(String, nullable=True)  # 利回り

    source_type = Column(String, nullable=False)  # email / pdf / gmail
    source_filename = Column(String, nullable=True)
    raw_text = Column(Text, nullable=False)

    gmail_message_id = Column(String, nullable=True, unique=True, index=True)
    gmail_thread_id = Column(String, nullable=True)

    received_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
