// Node has no DOM in this project. This boundary fake models only element,
// focus and event operations used by the real panel; it does no panel logic.
function createDOM() {
  const document = { activeElement: null };
  class Element {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.style = {};
      this.attributes = {};
      this.children = [];
      this.parentNode = null;
      this.listeners = new Map();
      this.hidden = false;
      this.disabled = false;
      this.checked = false;
      this.value = '';
      this._text = '';
    }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
    remove() {
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
      this.parentNode = null;
    }
    attachShadow() { this.shadowRoot = new Element('#shadow-root'); this.shadowRoot.host = this; return this.shadowRoot; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    focus() { if (!this.disabled) document.activeElement = this; }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
    }
    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
    dispatchEvent(event) {
      event.target = this;
      event.defaultPrevented = false;
      event.preventDefault = () => { event.defaultPrevented = true; };
      event.stopPropagation = () => { event.stopped = true; };
      const path = [];
      for (let node = this; node; node = node.parentNode || node.host) path.push(node);
      event.composedPath = () => path;
      for (const node of path) {
        for (const listener of node.listeners.get(event.type) || []) listener(event);
        if (event.stopped || event.bubbles === false) break;
      }
      return !event.defaultPrevented;
    }
  }
  document.createElement = tag => new Element(tag);
  document.listeners = new Map();
  for (const method of ['addEventListener', 'removeEventListener', 'dispatchEvent']) {
    document[method] = Element.prototype[method];
  }
  document.documentElement = new Element('html');
  document.documentElement.parentNode = document;
  document.body = document.documentElement.appendChild(new Element('body'));
  function find(root, predicate) {
    if (predicate(root)) return root;
    for (const child of root.children) { const found = find(child, predicate); if (found) return found; }
    return null;
  }
  return { document, find, fire: (element, type, properties = {}) => element.dispatchEvent({ type, ...properties }) };
}

module.exports = { createDOM };
