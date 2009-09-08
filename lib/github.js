GitHub = (function() {
  var global = (function(){ return this; }).call(null);
  var callCounter = 0;
  var GET = 'GET', POST = 'POST'; // just cuz

  function merge(dst, src, mask) {
    if (mask) {
      for (var k in src) if (mask[k]) dst[k] = src[k];
    } else {
      for (var k in src) dst[k] = src[k];
    }
    return dst;
  }

  function arrayToObject(ary,value) {
    if (typeof value == 'undefined') value = true;
    var obj = {};
    for (var i = 0; i < ary.length; i++) {
      obj[i] = value;
    }
    return obj;
  }
  
  // Lovingly borrowed from Prototype
  function argumentNames(func) {
    var names =
      func.toString().
      match(/^[\s\(]*function[^(]*\(([^)]*)\)/)[1].
      replace(/\/\/.*?[\r\n]|\/\*(?:.|[\r\n])*?\*\//g, "").
      replace(/\s+/g, "").
      split(",");
    return names.length == 1 && !names[0] ? [] : names;
  }

  // General purpose function argument processor. When passed the
  // 'arguments' object from another function, it figures out the
  // names and order of the formal parameters to that function and
  // based on that, builds an object out of the arguments.
  //
  // Also, if the last argument is an object and it has keys matching
  // any parameter names, the values for those keys are used as
  // arguments, replacing any actual arguments that conflict.

  function parseArgs(args,defaults) {
    var names = argumentNames(args.callee);
    var parsed = merge({},defaults||{});
    var keywords;

    for (var i = 0; i < args.length; i++) {
      var x = args[i];
      if (x && x.valueOf) x = x.valueOf();
      if (x != null && typeof x == 'object') {
        if (keywords) throw new Error("Only one object argument allowed");
        keywords = x;
      } else if (names.length > 0) {
        parsed[names.shift()] = x;
      } else {
        throw new Error("Superfluous argument");
      }
    }
    
    if (keywords) {
      names = arrayToObject(names);
      merge(parsed,keywords,names);
    }

    return parsed;
  }

  
  // API (class)
  //   Holds authentication info, return data format (JSON by default)
  //   and optionally a default callback and context. This is the root
  //   factory class. It can create Users and Repos.
  //
  //   Public properties/constructor params:
  //     user:      Authenticate as this GitHub account for all calls
  //     token:     API token for said account
  //     callback:  Default callback function, see 'invoke'
  //     context:   Default callback context, see 'invoke' again
  //     format:    Default result format, see 'invoke' yet again
  
  function API(user,token,callback,context) {
    merge(this,parseArgs(arguments,{format:null,context:null}));

    if (!this.user) throw new Error("A GitHub username is required");
    if (!this.token) throw new Error("An API token is required (go to GitHub and click on 'account')");

    function setCallback(callback,context) {
      this.callback = callback;
      if (context) this.context = context;
    }

    // This function can make any API call. All calls ultimately
    // go through this function.
    //   method:    HTTP method (passed as _method, all calls are really GETs)
    //   path:      Relative or absolute URI path as an array of components.
    //              An empty first element indicates an absolute path. Relative
    //              paths are prefixed with "/api/v2/(format)/". All components
    //              are escaped by this function.
    //   form:      CGI parameters, passed in the query string.
    //   callback:  Function that will be called with the result
    //              as the only argument. If omitted, the default callback is used.
    //   context:   Passed as 'this' to the callback function. If omitted, the
    //              default is used. If the ultimate value is null, the callback
    //              context will be the global object.
    //   format:    One of 'json', 'yaml', 'xml' or null for native JS objects.
    //              DISABLED, probably forever, since there's really no reason to
    //              use anything but JSON.

    function invoke(method,path,form,callback,context) {
      var args = parseArgs(arguments,this);
      var script = global.document.createElement('script');
      var head = global.document.getElementsByTagName('head')[0];

      // Take a local copies of these because we don't want them changing
      var format = args.format;          // between now and the callback.
      var context = args.context;
      var callback = args.callback;

      // Allocate a unique global name for the callback. We need
      // to pass a name to JSONP and a plain global identifier
      // is probably safest (though it seems to work even with
      // complicated references like foo.bar['baz']().woot )
      var callid;
      do {
        callid = '__GitHubCallback' + callCounter++;
      } while (global[callid]);

      // Install the callback, wrapped in a function that deletes
      // the global callback name and the dynamic <script> tag,
      // and evals the JSON result if format is null.
      global[callid] = function(result) {
        delete global[callid];
        head.removeChild(script);
        if (format === null) { result = eval(result); }
        callback.call(context,result);
      };


      // Constructing the URI, Chapter 1:
      var uri = ["http://github.com"];

      var escaped = [];
      for (var i = 0; i < path.length; i++) {
        escaped.push(escape(args.path[i]));
      }

      // Chapter 2: if it's a relative path, generate a prefix
      if (escaped[0]) {
        uri.push('api','v2',(format === null ? 'json' : format));
      } else {
        escaped.shift();
      }
      
      Array.prototype.push.apply(uri,escaped);
      uri = [uri.join('/')];

      // Chapter 3: fixed form parameters, go with every call
      uri.push("?login="+escape(this.user),
               "&token="+escape(this.token),
               "&callback="+escape(callid));

      // Chapter 4: for any non-GET method, add the _method hack,
      // (though GitHub doesn't seem to require it).
      if (args.method && args.method != 'GET') {
        uri.push("&_method=",args.method.toUpperCase());
      }

      // Chapter 5: dynamic form parameters passed to us
      for (var k in args.form) {
        uri.push("&"+escape(k)+"="+escape(args.form[k]));
      }

      // Chapter 6: join the array and let 'er rip
      script.src = path.join('');
      head.appendChild(script);
    }

    // Factory methods
    function user(u) { return new User(this,u); }
    function repo(u,r) { return new Repo(this,u,r); }
    function issue(u,r,i) { return new Issue(this,u,r,i); }
    function tree(u,r,tsha) { return new Tree(this,u,r,tsha); }

    // "Global" methods
    function userSearch(q) { }
    function repoSearch(q) { }
    
    merge(this,{ setCallback: setCallback,
                 user: user,
                 repo: repo,
                 //userSearch: userSearch,
                 //repoSearch: repoSearch,
                 invoke: invoke });
  }
  
  function User(login,user) {
    merge(this,parseArgs(arguments,login));

    function profile(callback,context) {
      args = parseArgs(arguments,this.login);
      this.login.invoke({path: ['user','show',this.user],
                         context: this,
                         callback: function(json) {
                           args.callback.call(args.context,json.user); }});
    }

    function followers(callback,context) {}
    function following(callback,context) {}
    function follow(user,callback,context) {}
    function unfollow(user,callback,context) {}

    // Key methods don't take a user parameter, they just work
    // with the authenticated user. If this is not that user,
    // you'll get an immediate error.
    function keys(callback,context) {}
    function addKey(name,key,callback,context) {}
    function removeKey(id,callback,context) {}

    // Ditto for emails
    function emails(callback,context) {}
    function addEmail(email,callback,context) {}
    function removeEmail(email,callback,context) {}

    function repo(r) { return new Repo(this.login,this.user,r); }
    function repos(callback,context) { }
    function createRepo(name,description,homepage,public) { }

    merge(this,{ profile: profile,
                 repo: repo });
  }

  function Repo(login,user,repo) {
    merge(this,parseArgs(arguments,login));

    // User is implicitly the authed one for these methods
    function watch(repo,callback,context) { }
    function unwatch(repo,callback,context) { }

    function fork(repo,callback,context) { }

    function delete(callback,context) { }
    
    function setPrivate(callback,context) { }
    function setPublic(callback,context) { }

    function keys(callback,context) { }
    function addKey(title,key,callback,context) { }
    function removeKey(title,key,callback,context) { }

    // These can be called on any user
    function info(callback,context) { }
    function collaborators(callback,context) { }
    function network(callback,context) { }
    function tags(callback,context) { }
    function branches(callback,context) { }
    function blob(path,callback,context) { }

    // "Old" network API used for network browser
    function networkMeta(callback,context) {
      var args = parseArgs(arguments,this.login);
      this.login.invoke({path: ['',this.user,this.repo,'network_meta'],
                         context:this,
                         callback:function(json) {
                           args.callback.call(args.context,
                                              new Network(this.login,
                                                          this.user,
                                                          this.repo,
                                                          json))}});
    }
    function networkDataChunk(nethash,start,end,callback,context) {
      var args = parseArgs(arguments,this.login);
      args.path = ['',this.user,this.repo,'network_data_chunk'];
      this.login.invoke(args);
    }

    merge(this,{ networkMeta: networkMeta,
                 networkDataChunk: networkDataChunk });
  }

  function Network(login,user,repo,meta) {
    merge(this,parseArgs(arguments,login));
    function chunk(start,end,callback,context) {
      var args = parseArgs(arguments,this.login);
      args.path = ['',this.user,this.repo,'network_data_chunk'];
      this.login.invoke(args);
    }
    this.chunk = chunk;
  }
  
  function Issue(login,user,repo,number) { }

  function Tree(login,user,repo,tsha) {
    merge(this,parseArgs(arguments,login));
    function items(callback,context) {
      var args = parseArgs(arguments,login);
      this.login.invoke({path: ['tree','show',this.user,this.repo,this.tsha],
                    context:this,
                    callback:function(json) {
                      args.callback.call(args.context,json.tree);
                    }});
    }
    
    function blob(path,callback,context) {
      var args = parseArgs(arguments,login);
      login.invoke({path: ['blob','show',user,repo,tsha,args.path],
                    context: this,
                    callback: function(json) {
                      args.callback.call(args.context,
                                         new Blob(login,
                                                  user,
                                                  repo,
                                                  json.blob,
                                                  json.blob.sha));}});
      
    }
  }

  function Blob(login,user,repo,meta) {
    function get(callback,context) {
      var args = parseArgs(arguments,login);
      login.invoke({path: ['blob','show',user,repo,meta.sha],
                    context: args.context,
                    callback: args.callback });
    }
    function uri() { }
  }
  
})();