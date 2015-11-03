var Carbon;
(function (Carbon) {
    var EventHandler = (function () {
        function EventHandler(element, type, handler, useCapture) {
            this.element = element;
            this.type = type;
            this.handler = handler;
            this.useCapture = useCapture;
            this.element.addEventListener(type, handler, useCapture);
        }
        EventHandler.prototype.stop = function () {
            this.element.removeEventListener(this.type, this.handler, this.useCapture);
        };
        return EventHandler;
    })();
    var _Func = (function () {
        function _Func(handler, context, callback) {
            this.handler = handler;
            this.context = context;
            this.callback = callback;
        }
        return _Func;
    })();
    var Router = (function () {
        function Router(routes) {
            this.routes = [];
            this.callbacks = [];
            this.executing = false;
            this.context = null;
            if (routes && typeof routes == 'object') {
                var keys = Object.keys(routes);
                for (var _i = 0; _i < keys.length; _i++) {
                    var key = keys[_i];
                    this.route(key, routes[key]);
                }
            }
        }
        Router.prototype.start = function (options) {
            this.popObserver = new EventHandler(window, 'popstate', this._onpopstate.bind(this), false);
            this.clickObserver = new EventHandler(window, 'click', this._onclick.bind(this), true);
            var cxt = new RouterContext(location.pathname + location.search, null);
            cxt.init = true;
            cxt.save();
            this._dispatch(cxt);
        };
        Router.prototype.stop = function () {
            this.popObserver.stop();
            this.clickObserver.stop();
        };
        Router.prototype.route = function (path, handler) {
            this.routes.push(new Route(path, handler));
        };
        Router.prototype.navigate = function (url, options) {
            var cxt = new RouterContext(url, null);
            if (options && options.replace)
                cxt.replace = true;
            this._navigate(cxt);
        };
        Router.prototype._navigate = function (cxt) {
            if (this.beforeNavigate) {
                this.beforeNavigate(cxt);
            }
            if (this.context) {
                this.prevpath = this.context.path;
                if (this.context.url == cxt.url)
                    return;
            }
            if (cxt.replace) {
                cxt.save();
            }
            else {
                history.pushState(cxt.state, cxt.title, cxt.url);
            }
            this._dispatch(cxt);
        };
        Router.prototype._dispatch = function (cxt) {
            if (this.context && this.context.route.unload) {
                var n = this.context;
                n.nextpath = cxt.path;
                this._execute(new _Func(this.context.route.unload, n));
            }
            if (!cxt.route) {
                cxt.route = this._getRoute(cxt);
            }
            if (!cxt.route)
                return;
            cxt.params = cxt.route.params(cxt.path);
            if (this.beforeLoad) {
                this.beforeLoad(cxt);
            }
            this._execute(new _Func(cxt.route.handler, cxt));
            this.context = cxt;
        };
        Router.prototype._getRoute = function (cxt) {
            for (var _i = 0, _a = this.routes; _i < _a.length; _i++) {
                var route = _a[_i];
                if (route.test(cxt.path))
                    return route;
            }
            return null;
        };
        Router.prototype._execute = function (action) {
            this.callbacks.push(action);
            if (!this.executing)
                this._fireNext();
        };
        Router.prototype._fireNext = function () {
            if (this.callbacks.length == 0) {
                this.executing = false;
                return;
            }
            this.executing = true;
            var action = this.callbacks.shift();
            var result = action.handler(action.context);
            if (result && result.then) {
                result.then(this._fireNext.bind(this));
            }
            else {
                this._fireNext();
            }
        };
        Router.prototype._onpopstate = function (e) {
            if (!e.state || !e.state.url)
                return;
            this._dispatch(new RouterContext(e.state.url, e.state));
        };
        Router.prototype._onclick = function (e) {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.defaultPrevented)
                return;
            var el = e.target;
            while (el && el.nodeName !== 'A')
                el = el.parentNode;
            if (!el || el.nodeName !== 'A')
                return;
            var href = el.getAttribute('href');
            if (!href)
                return;
            if (href.indexOf('://') > -1 || href.indexOf('mailto:') > -1)
                return;
            var cxt = new RouterContext(href, null);
            cxt.route = this._getRoute(cxt);
            if (!cxt.route)
                return;
            cxt.clickEvent = e;
            cxt.target = el;
            e.preventDefault();
            this._navigate(cxt);
        };
        return Router;
    })();
    Carbon.Router = Router;
    var RouterContext = (function () {
        function RouterContext(url, state) {
            this.init = false;
            this.title = null;
            this.replace = false;
            this.url = url;
            this.path = url.split('?')[0];
            this.pathname = this.path;
            this.state = state || {};
            this.state.url = url;
        }
        RouterContext.prototype.save = function () {
            history.replaceState(this.state, this.title, this.url);
        };
        return RouterContext;
    })();
    Carbon.RouterContext = RouterContext;
    var Route = (function () {
        function Route(url, fn) {
            this.paramNames = [];
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
        Route.prototype.params = function (path) {
            var match = this.regexp.exec(path);
            if (!match)
                return null;
            var params = {};
            for (var i = 1; i < match.length; i++) {
                params[this.paramNames[i - 1]] = match[i];
            }
            return params;
        };
        Route.prototype.test = function (path) {
            return !!this.regexp.test(path);
        };
        return Route;
    })();
    Carbon.Route = Route;
})(Carbon || (Carbon = {}));
