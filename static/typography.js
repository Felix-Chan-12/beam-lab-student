// Format live mathematical text without modifying diagram images.
(() => {
  // Mark only mathematical quantities; prose such as AI and stage letters stays upright.
  function variables(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.parentElement.closest('script, style, i, .math-variable, sub, sup, button:not(.special-candidates button), .brand, .session-pill, .roadmap-step, .self-guided-nav, input, .url')) nodes.push(n);
    }
    const pattern = /F(?:yB|yA|xA)|\b(?:ql|EI|q|l|F|M|X|E|I|k)\b|Δ/g;
    for (const node of nodes) {
      pattern.lastIndex = 0;
      if (!pattern.test(node.textContent)) continue;
      pattern.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let end = 0;
      for (const match of node.textContent.matchAll(pattern)) {
        fragment.append(node.textContent.slice(end, match.index));
        const el = document.createElement('i');
        el.className = 'math-variable';
        el.textContent = match[0];
        fragment.append(el);
        end = match.index + match[0].length;
      }
      fragment.append(node.textContent.slice(end));
      node.replaceWith(fragment);
    }
  }
  const observer = new MutationObserver(refresh);
  function refresh() {
    observer.disconnect();
    variables(document.querySelector('#app'));
    observer.observe(document.querySelector('#app'), { childList: true, subtree: true, characterData: true });
  }
  refresh();
})();
