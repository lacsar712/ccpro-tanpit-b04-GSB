"""鞣坑放液门槛：最近一次浸液酸碱度须在 3.5～5.0。

坑笔记规矩：汉字 10～48、正文必带村名「青皮村」与两位连续数字鞣次（如 07）。
改坑态、登记酸碱度不读笔记规矩。
"""

import re

from pits.models import Pit

MIN_PH = 3.5
MAX_PH = 5.0

NOTE_MIN_HANZI = 10
NOTE_MAX_HANZI = 48
NOTE_VILLAGE = "青皮村"
HANZI_RE = re.compile(r"[一-鿿]")  # 一-鿿 = CJK 常用汉字区间
TAN_BATCH_RE = re.compile(r"[0-9]{2}")


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


def count_hanzi(text: str) -> int:
    return len(HANZI_RE.findall(text))


def validate_note_body(body: str | None) -> str:
    """校验坑笔记正文，返回可落库的文本；不合格抛 RuleError。

    先验后写：任何一条不过都直接打回，绝不先落库再改字。
    空白备注按缺字处理。
    """
    text = (body or "").strip()
    hanzi = count_hanzi(text)
    if hanzi < NOTE_MIN_HANZI or hanzi > NOTE_MAX_HANZI:
        raise RuleError(f"坑笔记汉字须落在 {NOTE_MIN_HANZI}～{NOTE_MAX_HANZI}，当前 {hanzi} 字")
    if NOTE_VILLAGE not in text:
        raise RuleError(f"坑笔记须写明村名「{NOTE_VILLAGE}」")
    if not TAN_BATCH_RE.search(text):
        raise RuleError("坑笔记须含两位连续数字作鞣次，如 07")
    return text
