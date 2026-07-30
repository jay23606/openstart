import { renderMarkup } from "./render.js";

export function createPageLifecycle({
  page,
  setPageMetadata,
  syncNavigation,
  scrollToTop = () => scrollTo(0, 0),
  afterRender = () => {},
}) {
  function render(markup, {
    metadata,
    sync = false,
    focus = false,
    scroll = false,
  } = {}) {
    if (metadata) {
      setPageMetadata(metadata.title, metadata.description, metadata.image);
    }
    renderMarkup(page, markup);
    afterRender(page);
    if (sync) syncNavigation();
    if (scroll) scrollToTop();
    if (focus) page.focus({ preventScroll: true });
    return page;
  }

  function afterNavigate() {
    syncNavigation();
    page.focus({ preventScroll: true });
  }

  function error(markup) {
    return render(markup, {
      metadata: {
        title: "OpenStart could not load",
        description: "OpenStart encountered an unexpected loading error.",
      },
      sync: true,
      focus: true,
    });
  }

  return { afterNavigate, error, render };
}
