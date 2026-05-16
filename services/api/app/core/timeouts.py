import logging
from collections.abc import Callable
from queue import Empty, Queue
from threading import Thread
from typing import TypeVar


T = TypeVar("T")
logger = logging.getLogger("audidisc.api.timeouts")


def run_with_wall_timeout(
    call: Callable[[], T],
    *,
    default: T,
    context: str,
    timeout_seconds: float = 5.0,
) -> T:
    result_queue: Queue[tuple[str, object]] = Queue(maxsize=1)

    def runner() -> None:
        try:
            result_queue.put(("ok", call()))
        except Exception as exc:  # pragma: no cover - depends on live providers.
            result_queue.put(("error", exc))

    Thread(target=runner, name=f"audidisc-{context.replace(' ', '-')}", daemon=True).start()
    try:
        status_value, payload = result_queue.get(timeout=timeout_seconds)
    except Empty:
        logger.warning("%s exceeded wall timeout", context)
        return default

    if status_value == "error":
        logger.warning("%s failed: %s", context, payload)
        return default
    return payload  # type: ignore[return-value]
