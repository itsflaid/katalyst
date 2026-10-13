// Memindahkan node ke target (default body) supaya lepas dari overflow dan stacking leluhurnya.
export function portal(node: HTMLElement, target: HTMLElement | string = 'body') {
  const host = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  host?.appendChild(node);

  return {
    destroy() {
      node.remove();
    }
  };
}
