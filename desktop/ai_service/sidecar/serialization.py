from __future__ import annotations

from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any


def append_interrupts(values: dict[str, Any], interrupts: list[dict[str, Any]]) -> dict[str, Any]:
    next_values = dict(values)
    if interrupts:
        next_values["__interrupt__"] = interrupts
    elif "__interrupt__" in next_values:
        del next_values["__interrupt__"]
    return next_values


def chunk_text(value: str, size: int = 18) -> list[str]:
    if not value:
        return [""]
    return [value[index : index + size] for index in range(0, len(value), size)]


def serialize(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(key): serialize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [serialize(item) for item in value]
    if is_dataclass(value):
        return serialize(asdict(value))
    if hasattr(value, "model_dump"):
        return serialize(value.model_dump())
    if hasattr(value, "dict"):
        return serialize(value.dict())
    if hasattr(value, "value") and hasattr(value, "id"):
        return {
            "id": serialize(getattr(value, "id")),
            "value": serialize(getattr(value, "value")),
        }
    if hasattr(value, "content") and hasattr(value, "type"):
        serialized = {
            "type": serialize(getattr(value, "type")),
            "content": serialize(getattr(value, "content")),
        }
        for field in [
            "id",
            "name",
            "tool_calls",
            "tool_call_id",
            "status",
            "additional_kwargs",
            "response_metadata",
            "usage_metadata",
        ]:
            if hasattr(value, field):
                field_value = serialize(getattr(value, field))
                if field_value not in (None, [], {}):
                    serialized[field] = field_value
        return serialized
    if hasattr(value, "__dict__"):
        return serialize(vars(value))
    return str(value)
