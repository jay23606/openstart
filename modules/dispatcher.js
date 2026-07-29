export function createDispatcher(handlers = []) {
  const activeHandlers = handlers.filter((handler) => typeof handler === "function");

  return async function dispatch(...args) {
    for (const handler of activeHandlers) {
      if (await handler(...args)) return true;
    }
    return false;
  };
}

export function handlersFrom(controllers, method) {
  return controllers.flatMap((controller) => {
    const handler = controller?.[method];
    return typeof handler === "function" ? [handler.bind(controller)] : [];
  });
}
