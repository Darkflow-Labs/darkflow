type SocketLike = {
  addEventListener?: (type: string, listener: (ev: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (ev: unknown) => void) => void;
  on?: (type: string, listener: (...args: unknown[]) => void) => void;
  off?: (type: string, listener: (...args: unknown[]) => void) => void;
};

const normalizeMessageData = (data: unknown): string => {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data.buffer);
  }
  const Buf = (globalThis as { Buffer?: { isBuffer: (v: unknown) => boolean; prototype: { toString: (enc: string) => string } } })
    .Buffer;
  if (Buf?.isBuffer?.(data)) {
    return (data as { toString: (enc: string) => string }).toString("utf8");
  }
  return String(data);
};

export const attachSocketHandlers = (
  socket: unknown,
  handlers: {
    onMessage: (text: string) => void;
    onClose: () => void;
    onError: (err: unknown) => void;
  }
): (() => void) => {
  const s = socket as SocketLike;
  const unsubs: Array<() => void> = [];

  if (typeof s.addEventListener === "function") {
    const onMessage = (ev: unknown) => {
      if (typeof MessageEvent !== "undefined" && ev instanceof MessageEvent) {
        handlers.onMessage(String(ev.data));
        return;
      }
      handlers.onMessage(String((ev as { data?: unknown }).data ?? ""));
    };
    const onClose = () => {
      handlers.onClose();
    };
    const onError = (ev: unknown) => {
      handlers.onError(ev);
    };
    s.addEventListener("message", onMessage);
    s.addEventListener("close", onClose);
    s.addEventListener("error", onError);
    unsubs.push(() => {
      s.removeEventListener?.("message", onMessage);
      s.removeEventListener?.("close", onClose);
      s.removeEventListener?.("error", onError);
    });
  } else if (typeof s.on === "function") {
    const onMessage = (...args: unknown[]) => {
      const data = args[0];
      handlers.onMessage(normalizeMessageData(data));
    };
    const onClose = () => {
      handlers.onClose();
    };
    const onError = (err: unknown) => {
      handlers.onError(err);
    };
    s.on("message", onMessage);
    s.on("close", onClose);
    s.on("error", onError);
    unsubs.push(() => {
      s.off?.("message", onMessage);
      s.off?.("close", onClose);
      s.off?.("error", onError);
    });
  }

  return () => {
    for (const u of unsubs) {
      u();
    }
  };
};
