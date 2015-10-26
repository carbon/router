module Carbon {
  class _Func {
    handler: any;
    context: any;
    callback: any;

    constructor(handler, context, callback) {
      this.handler = handler;
      this.context = context;
      this.callback = callback;
    }
  }

  export class Router {
    routes: Array<Route> = [ ];
    callbacks: Array<_Func> = [ ];

    executing = false;

    context: RouterContext = null;

    constructor(routes) {
      if (routes && typeof routes == 'object') {
        var keys = Object.keys(routes);

        for(var i = 0; i < keys.length; i++) {
          var key = keys[i];

          this.route(key, routes[key]);
        }
      }
    }

    start(options) {
      this.psl = this._onpopstate.bind(this);
      this.cl = this._onclick.bind(this);

      window.addEventListener('popstate', this.psl, false);
      window.addEventListener('click', this.cl, false);

      var cxt = new RouterContext(
        /*url*/ location.pathname + location.search,
        /*state*/ null
      );

      cxt.init = true;

      cxt.save();

      this._dispatch(cxt); // Initial dispatch
    }

    stop() {
      window.removeEventListener('popstate', this.psl, false);
      window.removeEventListener('click', this.cl, false);
    }

    route(path, handler) {
      this.routes.push(new Route(path, handler));
    }

    navigate(url, options) {
      var cxt = new RouterContext(url, null);

      if (options && options.replace) cxt.replace = true;

      this._navigate(cxt);
    }

    _navigate(cxt) {
      if (this.beforeNavigate) {
        this.beforeNavigate(cxt);
      }

      if (this.context) {
        this.prevpath = this.context.path;

        if (this.context.url == cxt.url) return; // same
      }

      if (cxt.replace) {
        cxt.save();
      }
      else {
        history.pushState(cxt.state, cxt.title, cxt.url);
      }

      this._dispatch(cxt);
    }

    _dispatch(cxt) {
      if (this.context && this.context.route.unload) {
        var n = this.context;

        n.nextpath = cxt.path;

        this._execute(new _Func(this.context.route.unload, n));
      }

      if (!cxt.route) {
        cxt.route = this._getRoute(cxt);
      }

      if (!cxt.route) return;

      cxt.params = cxt.route.params(cxt.path);

      if (this.beforeLoad) {
        this.beforeLoad(cxt);
      }

      this._execute(new _Func(cxt.route.handler, cxt));

      this.context = cxt;
    }

    _getRoute(cxt) {
      for (var i = 0; i < this.routes.length; i++) {
        var route = this.routes[i];

        if (route.test(cxt.path)) return route;
      }

      return null;
    }

    _execute(action: _Func) {
      this.callbacks.push(action);

      // execute immediatly if we can
      if (!this.executing) this._fireNext();
    }

    _fireNext() {
      if (this.callbacks.length == 0) {
        this.executing = false;

        return;
      }

      this.executing = true;

      // Pick the next action off the queue
      var action = this.callbacks.shift();

      var result = action.handler(action.context);

      if (result && result.then) {
        result.then(this._fireNext.bind(this));
      }
      else {
        this._fireNext();
      }
    }

    _onpopstate(e) {
      if (!e.state || !e.state.url) return;

      this._dispatch(new RouterContext(e.state.url, e.state));
    }

    _onclick(e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.defaultPrevented) return;

      var el = <HTMLElement>e.target;

      while (el && el.nodeName !== 'A') el = <HTMLElement>el.parentNode;

      if (!el || el.nodeName !== 'A') return;

      var href = el.getAttribute('href');

      if (!href) return;

      if (href.indexOf('://') > -1 || href.indexOf('mailto:') > -1) return;

      var cxt = new RouterContext(href, null);

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
    pathname: string;
    state: any;

    init = false;
    title = null;
    replace = false;

    route: Route;

    constructor(url, state) {
      this.url = url;
      this.path = url.split('?')[0];
      this.pathname = this.path;

      this.state = state || { };

      this.state.url = url;
    }

    save() {
      history.replaceState(this.state, this.title, this.url);
    }
  }

  export class Route {
    url: string;
    paramNames: Array<string> = [ ];
    handler: Function;
    regexp: RegExp;

    constructor(url: string, fn: Function) {
      this.url = url;

      this.handler = fn;

      var re = /{([^}]+)}/g;

      var re2 = url;

      var item;

      while (item = re.exec(url)) {
        this.paramNames.push(item[1]);

        re2 = re2.replace(item[0], '\s*(.*)\s*');
      }

      if (fn.load) {
        this.handler = fn.load.bind(fn);
        this.unload = fn.unload.bind(fn);
      }

      this.regexp = new RegExp(re2 + '$', 'i');
    }

    params(path) {
      var match = this.regexp.exec(path);

      if (!match) return null;

      var params = { };

      for(var i = 1; i < match.length; i++) {
        params[this.paramNames[i - 1]] = match[i];
      }

      return params;
    }

    test(path) {
      return !!this.regexp.test(path);
    }
  }
}
