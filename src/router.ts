module Carbon {
  export class Router {
    static instance: Router;

    routes: Route[] = [];
    callbacks: RouteAction[] = [];

    context: RouterContext = null;

    popObserver: EventHandler;
    clickObserver: EventHandler;

    beforeLoad: Function;
    beforeNavigate: Function;

    executing = false;

    constructor(routes: Route[]) {
      if (routes && typeof routes == 'object') {
        let keys = Object.keys(routes);

        for (var key of keys) {
          this.route(key, routes[key]);
        }
      }

      Router.instance = this;
    }

    start(options) {
      this.popObserver = new EventHandler(window, 'popstate', this._onpopstate.bind(this), false);
      this.clickObserver =  new EventHandler(window, 'click', this._onclick.bind(this), true);

      let cxt = new RouterContext(
        /*url*/ location.pathname + location.search,
        /*state*/ null
      );

      cxt.hash = location.hash;

      cxt.init = true;

      cxt.save();

      this._dispatch(cxt); // Initial dispatch
    }

    on(type: string, listener: EventListener) {
      document.addEventListener(type, listener, false);
    }

    stop() {
      this.popObserver.stop();
      this.clickObserver.stop();
    }

    route(path, handler: Function) {
      this.routes.push(new Route(path, handler));
    }

    navigate(url, options) {
      let cxt = new RouterContext(url, null);

      if (options && options.replace) cxt.replace = true;

      this._navigate(cxt);
    }

    _navigate(cxt: RouterContext) {
      let result = trigger(document, 'router:navigate', cxt);

      if (result === false) return;

      if (this.beforeNavigate) {
        this.beforeNavigate(cxt);
      }

      if (this.context) {
        if (this.context.url === cxt.url) return; // same
      }

      if (cxt.replace) {
        cxt.save();
      }
      else {
        history.pushState(cxt.state, cxt.title, cxt.url);
      }

      this._dispatch(cxt);
    }

    _dispatch(cxt: RouterContext) {
      let context = this.context; // current context (being replaced)
            
      if (context && context.route.unload) {  
        context.nextpath = cxt.path;

        this._execute(new RouteAction('unload', context.route.unload, context));
      }

      if (!cxt.route) {
        cxt.route = this._getRoute(cxt);
      }

      if (!cxt.route) return;

      cxt.params = cxt.route.params(cxt.path);
      
      if (context) {
        cxt.prevpath = context.path;
      }
      
      if (this.beforeLoad) {
        this.beforeLoad(cxt);
      }

      this._execute(new RouteAction('load', cxt.route.load, cxt));

      this.context = cxt;
    }

    _getRoute(cxt: RouterContext) {
      for (var route of this.routes) {
        if (route.test(cxt.path)) return route;
      }

      return null;
    }

    _execute(action: RouteAction) {
      this.callbacks.push(action);

      // execute immediatly if we can
      if (!this.executing) {
        this._fireNext();
      }
    }

    _fireNext() {
      if (this.callbacks.length === 0) {
        this.executing = false;

        return;
      }

      this.executing = true;

      // Pick the next action off the queue
      let action = this.callbacks.shift();

      let result = action.handler(action.context);

      if (result && result.then) {
        result.then(() => {
          trigger(document, 'route:' + action.type, action.context);;

          this._fireNext();
        });
      }
      else {
        this._fireNext();

        trigger(document, 'route:' + action.type, action.context);
      }
    }

    _onpopstate(e) {
      if (!e.state || !e.state.url) return;

      this._dispatch(new RouterContext(e.state.url, e.state));
    }

    _onclick(e: MouseEvent) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.defaultPrevented) return;

      let el = <HTMLElement>e.target;

      while (el && el.nodeName !== 'A') el = <HTMLElement>el.parentNode;

      if (!el || el.nodeName !== 'A') return;

      let href = el.getAttribute('href');

      if (!href) return;

      if (href.indexOf('://') > -1 || href.indexOf('mailto:') > -1) return;

      let cxt = new RouterContext(href, null);

      // Ensure it matches a route
      cxt.route = this._getRoute(cxt);

      if (!cxt.route) return;

      cxt.clickEvent = e;
      cxt.target = el;

      e.preventDefault();

      this._navigate(cxt);
    }
  }

  export class RouterContext {
    url: string;
    path: string;
    hash: string;
    prevpath: string;
    nextpath: string;
    pathname: string;
    state: any;

    title = null;

    params: any;

    route: Route;

    clickEvent: MouseEvent;
    target: HTMLElement;

    init = false;
    replace = false;

    constructor(url: string, state) {
      this.url = url;
      this.path = url.split('?')[0];
      this.pathname = this.path;

      this.state = state || { };

      this.state.url = url;
    }

    save() {
      history.replaceState(this.state, this.title, this.url + this.hash);
    }
  }

  export class Route {
    url: string;
    paramNames: string[] = [ ];

    regexp: RegExp;

    load: Function;
    unload: Function;

    constructor(url: string, fn: Function | { load: Function, unload: Function }) {
      this.url = url;

      if (typeof fn === 'function') {
        this.load = <Function>fn;
      }
      else {
        this.load = fn.load.bind(fn);
        this.unload = fn.unload.bind(fn);
      }

      const re = /{([^}]+)}/g;

      var re2 = url;

      var item;

      while (item = re.exec(url)) {
        this.paramNames.push(item[1]);

        re2 = re2.replace(item[0], '\s*(.*)\s*');
      }

      this.regexp = new RegExp(re2 + '$', 'i');
    }

    params(path: string) {
      let match = this.regexp.exec(path);

      if (!match) return null;

      let params = { };

      for (var i = 1; i < match.length; i++) {
        params[this.paramNames[i - 1]] = match[i];
      }

      return params;
    }

    test(path) {
      return !!this.regexp.test(path);
    }
  }

  function trigger(element: Element | Document, name: string, detail?) : boolean {
    return element.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      detail: detail
    }));
  }

  class EventHandler {
    constructor(public element: HTMLElement | Window, public type, public handler, public useCapture = false) {
      this.element.addEventListener(type, handler, useCapture);
    }

    stop() {
      this.element.removeEventListener(this.type, this.handler, this.useCapture);
    }
  }

  class RouteAction {
    constructor(public type: string, public handler: Function, public context: RouterContext) { }
  }
}