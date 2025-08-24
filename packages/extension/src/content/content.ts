// Content script
// Collects current path and attempts to enumerate mounted React component names

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.type === "collectContext") {
    try {
      const context = collectContext();
      sendResponse({ ok: true, context });
    } catch (error) {
      console.error("collectContext failed", error);
      sendResponse({ ok: false, error: (error as Error)?.message || String(error) });
    }
    return true;
  }
});

function collectContext() {
  const path =
    window.location.pathname + window.location.search + window.location.hash;
  const url = window.location.href;
  return { path, url };
}

// This function is available but not currently used in context collection
// function getReactComponentNamesLimited(limit = 200): Set<string> {
//   const names = new Set<string>();
//   // Implementation available if needed
//   return names;
// }

// React component detection functions - available if needed for future enhancements
/*
function getRendererIdsFromHook(hook: any): number[] {
  const ids: number[] = [];
  const renderers = hook.renderers || hook._renderers; // Map-like
  if (renderers) {
    if (typeof renderers.forEach === "function") {
      renderers.forEach((_: any, id: number) => ids.push(id));
    } else if (Array.isArray(renderers)) {
      for (const [id] of renderers) ids.push(id);
    } else if (typeof renderers === "object") {
      for (const key of Object.keys(renderers)) ids.push(Number(key));
    }
  }
  return ids;
}

function findAnyFiberFromDom(maxScanNodes = 2000): any {
  const walker = document.createTreeWalker(
    document.body || document.documentElement,
    NodeFilter.SHOW_ELEMENT
  );
  let count = 0;
  let node: Node | null = walker.currentNode;
  while (node && count < maxScanNodes) {
    const fiber = getFiberFromDomNode(node as Element);
    if (fiber) return fiber;
    node = walker.nextNode();
    count++;
  }
  return null;
}

function getFiberFromDomNode(domNode: Element): any {
  for (const key in domNode) {
    if (key && key.startsWith("__reactFiber$")) {
      try {
        return (domNode as any)[key];
      } catch (_) {
        // ignore
      }
    }
  }
  return null;
}

function getRootFiber(fiber: any): any {
  let current = fiber;
  const seen = new Set();
  while (current && current.return && !seen.has(current)) {
    seen.add(current);
    current = current.return;
  }
  return current || fiber;
}

function* traverseFiberForNames(rootFiber: any, limit = 200): Generator<string, void, unknown> {
  const stack = [rootFiber];
  const seen = new Set();
  while (stack.length > 0 && seen.size < limit) {
    const fiber = stack.pop();
    if (!fiber || seen.has(fiber)) continue;
    seen.add(fiber);

    const displayName = getFiberDisplayName(fiber);
    if (displayName) yield displayName;

    if (fiber.child) stack.push(fiber.child);
    if (fiber.sibling) stack.push(fiber.sibling);
  }
}

function getFiberDisplayName(fiber: any): string | null {
  try {
    const type = fiber.elementType || fiber.type;
    if (!type) return null;
    if (typeof type === "string") return null; // host components like 'div'

    return (
      type.displayName ||
      type.name ||
      (type.render && (type.render.displayName || type.render.name)) ||
      null
    );
  } catch (_) {
    return null;
  }
}
*/