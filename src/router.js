const routes = {};
let currentCleanup = null;

export function route(path, handler) {
  routes[path] = handler;
}

export function navigate(path) {
  window.location.hash = path;
}

export function getCurrentPath() {
  return window.location.hash.slice(1) || '/';
}

function matchRoute(path) {
  // Exact match first
  if (routes[path]) return { handler: routes[path], params: {} };

  // Pattern matching (e.g., /team/:id)
  for (const [pattern, handler] of Object.entries(routes)) {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) continue;

    const params = {};
    let match = true;

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }

    if (match) return { handler, params };
  }

  return null;
}

export function startRouter() {
  async function handleRoute() {
    const path = getCurrentPath();
    const app = document.getElementById('app');

    if (currentCleanup) {
      currentCleanup();
      currentCleanup = null;
    }

    // Page exit transition
    app.classList.add('page-exit');
    await new Promise(r => setTimeout(r, 150));

    const matched = matchRoute(path);
    if (matched) {
      const cleanup = await matched.handler(app, matched.params);
      if (typeof cleanup === 'function') currentCleanup = cleanup;
    } else {
      app.innerHTML = '<div class="container"><h1>404 - Page Not Found</h1></div>';
    }

    // Page enter transition
    app.classList.remove('page-exit');
  }

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
