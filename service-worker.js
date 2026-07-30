const CACHE = "openstart-v103";
const APP_SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./core.js",
  "./data.js", "./theme.js", "./config.js", "./manifest.json", "./favicon.svg",
  "./assets/openstart-race-hero.png",
  "./features/registration/controller.js",
  "./features/registration/views.js",
  "./features/content/controller.js",
  "./features/demo/controller.js",
  "./features/account/controller.js",
  "./features/public/controller.js",
  "./features/organizer/controller.js",
  "./features/organizer/views.js",
  "./features/platform/controller.js",
  "./features/platform/views.js",
  "./features/series/controller.js",
  "./features/series/views.js",
  "./features/lottery/controller.js",
  "./features/lottery/views.js",
  "./features/communications/controller.js",
  "./features/communications/views.js",
  "./features/results/controller.js",
  "./features/results/views.js",
  "./features/volunteers/controller.js",
  "./features/volunteers/views.js",
  "./features/race-day/controller.js",
  "./features/race-day/views.js",
  "./features/event-commerce/controller.js",
  "./features/event-commerce/views.js",
  "./features/event-site/controller.js",
  "./features/event-site/views.js",
  "./features/waves/controller.js",
  "./features/waves/views.js",
  "./modules/app-state.js", "./modules/content-data.js",
  "./modules/account-views.js",
  "./modules/busy.js", "./modules/content-views.js", "./modules/discovery.js", "./modules/dispatcher.js", "./modules/page-lifecycle.js", "./modules/public-view-models.js", "./modules/public-views.js", "./modules/results.js",
  "./modules/render.js",
  "./modules/router.js", "./modules/ui-feedback.js", "./modules/ui.js",
  "./modules/shell-controller.js",
  "./modules/store.js",
  "./modules/view-runtime.js", "./modules/navigation-component.js",
  "./modules/discovery-results-component.js",
  "./modules/organizer-dashboard-component.js",
  "./modules/runner-dashboard-component.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && new URL(event.request.url).origin === location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html"))),
  );
});
