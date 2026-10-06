"""鞣坑规矩。

放液门槛：最近一次浸液酸碱度须在 3.5～5.0。
坑笔记：汉字 10～48 个，正文须见「青皮村」与两位连续数字作鞣次（如 07）。
改坑态、登记酸碱度不读笔记规矩。
"""

import re

from pits.models import Pit

MIN_PH = 3.5
MAX_PH = 5.0

VILLAGE_NAME = "青皮村"
MIN_HAN = 10
MAX_HAN = 48
HAN_RE = re.compile(r"[\u4e00-\u9fff]")
TAN_BATCH_RE = re.compile(r"\d{2}")


class RuleError(ValueError):
    pass


def latest_ph(pit: Pit) -> float | None:
    sample = pit.samples.order_by("-taken_at", "-id").first()
    return None if sample is None else sample.ph


def assert_can_set_status(pit: Pit, new_status: str) -> None:
    allowed = {Pit.STATUS_FILL, Pit.STATUS_TANNING, Pit.STATUS_DRAINED}
    if new_status not in allowed:
        raise RuleError(f"无效状态：{new_status}")
    if new_status != Pit.STATUS_DRAINED:
        return
    ph = latest_ph(pit)
    if ph is None:
        raise RuleError("该坑尚无浸液酸碱记录，不能放液")
    if ph < MIN_PH or ph > MAX_PH:
        raise RuleError(f"最近酸碱度 {ph} 不在 {MIN_PH}～{MAX_PH}，不能放液")


def assert_note_body_ok(body: str) -> None:
    """笔记落库前把关；不合格直接打回，空白按缺字处理。"""
    text = body or ""
    han = len(HAN_RE.findall(text))
    if han < MIN_HAN or han > MAX_HAN:
        raise RuleError(f"缺字：汉字须 {MIN_HAN}～{MAX_HAN} 个，当前 {han} 个")
    if VILLAGE_NAME not in text:
        raise RuleError(f"缺村名：正文须出现「{VILLAGE_NAME}」")
    if not TAN_BATCH_RE.search(text):
        raise RuleError("缺鞣次：正文须含两位连续数字（如 07）")
