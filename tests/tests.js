/*jslint indent: 2, vars: true, plusplus: true */
/*global setTimeout, clearTimeout, window, location, asyncTest, EventSource, ok, strictEqual, start */

var NativeEventSource = this.EventSource;

window.onload = function () {
  "use strict";

  if (location.hash === "#native") {
    window.EventSource = NativeEventSource;
  }

  var url = "/events";
  var url4CORS = "http://" + location.hostname + ":" + (String(location.port) === "8004" ? "8003" : "8004") + "/events";
  var commonHeaders = "Access-Control-Allow-Origin: *\n" + 
                      "Content-Type: text/event-stream\n" +
                      "Cache-Control: no-cache\n";

  asyncTest("Cache-Control: no-cache", function () {
    var es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "Cache-Control: max-age=3600\nExpires: " + new Date(new Date().getTime() + 3600000).toUTCString() + "\n\n" + "retry:1000\ndata:<random()>\n\n"));
    var data = "";
    var f = true;
    var counter = 0;
    es.onmessage = function (event) {
      var x = event.data;
      f = data !== x;
      data = x;
      ++counter;
    };
    es.onerror = function () {
      if (counter === 2) {
        es.close();
        ok(f, "failed");
        start();
      }
    };
  });

  asyncTest("EventSource + window.stop", function () {
    var es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + "retry:1000\ndata:abc\n\n<delay(500)>"));
    var stopped = false;
    var openAfterStop = false;
    var errorAfterStop = false;
    es.onopen = function () {
      if (stopped) {
        openAfterStop = true;
      }
    };
    es.onerror = function () {
      if (stopped) {
        errorAfterStop = true;
      }
    };
    setTimeout(function () {
      stopped = true;
      if (window.Window) {// Opera < 12 has no Window
        window.Window.prototype.stop.call(window);
      }
    }, 100);
    setTimeout(function () {
      if (es.readyState === 2) {
        ok(!openAfterStop && errorAfterStop, " ");
      } else {
        ok(openAfterStop, " ");
      }
      start();
    }, 2000);
  });

  asyncTest("EventSource constructor", function () {
    var body = "";
    var es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + body));
    ok(es instanceof EventSource, "failed");
    es.close();
    start();
  });

  asyncTest("EventSource.CLOSED", function () {
    ok(EventSource.CLOSED === 2, "failed");
    start();
  });

  // Opera bug with "XMLHttpRequest#onprogress" 
  asyncTest("EventSource 3 messages with small delay", function () {
    var body = "data\n\n<delay(25)>data\n\n<delay(25)>data\n\n<delay(10000)>";
    var es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + body));    
    var n = 0;
    es.onmessage = function () {
      n++;
    };
    es.onerror = es.onopen = function () {
      es.onerror = es.onopen = null;
      setTimeout(function () {
        es.close();
        ok(n === 3, "failed, n = " + n);
        start();
      }, 1000);
    };
  });

  asyncTest("EventSource ping-pong", function () {
    var n = 0;
    var timeStamp = +new Date();
    var es = null;
    var timer = 0;
    var onTimeout = null;
    var body = "retry: 500\n" +
               "data: " + Math.random() + "\n\n" +
               "<delay(1500)>" +
               "data: " + Math.random() + "\n\n" +
               "<delay(1500)>" +
               "data: " + Math.random() + "\n\n" +
               "<delay(10000)>";
    es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + body));
    es.onmessage = function () {
      ++n;
      clearTimeout(timer);
      if (n === 3) {
        strictEqual(n, 3, "test 0, duration: " + (+new Date() - timeStamp));
        start();        
      } else {
        timer = setTimeout(onTimeout, 2000);
      }
    };
    onTimeout = function () {
      es.close();
      ok(false, "failed, n = " + n);
      start();
    };
    timer = setTimeout(onTimeout, 1000);
  });

  asyncTest("EventSource 1; 2; 3; 4; 5;", function () {
    var body = "retry: 500\n" +
               "id: <lastEventId(1)>\n" +
               "data: <lastEventId(1)>;\n\n" +
               "id: <lastEventId(2)>\n" +
               "data: <lastEventId(2)>;\n\n" +
               "id: <lastEventId(3)>\n" +
               "data: <lastEventId(3)>;\n\n";
    var es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + body));
    var s = "";
    var timer = 0;

    function onTimeout() {
      clearTimeout(timer);
      var z = " 1; 2; 3; 4; 5;";
      strictEqual(s.slice(0, z.length), z, "test 10");
      es.close();
      start();
    }

    timer = setTimeout(onTimeout, 2000);

    es.onmessage = function (event) {
      s += " " + event.data;
    };
  });

  asyncTest("event-stream parsing", function () {
    var body = "data:\\0\ndata:  2\rData:1\ndata\\0:2\ndata:1\r\\0data:4\nda-ta:3\rdata_5\ndata:3\rdata:\r\n data:32\ndata:4\n\n";
    var es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + body));
    es.onmessage = function (event) {
      strictEqual(event.data, "\\0\n 2\n1\n3\n\n4");
      es.close();
      start();
    };
  });

  // native EventSource is buggy in Opera, FF < 11, Chrome < ?
  asyncTest("EventSource test next", function () {
    var body = "retry: 500\n" +
               "data: -1\n\n" +
               "id: 1\n" +
               "data: 1\n\n" +
               "id: 2\n" +
               "drop connection test";
    var es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + body));
    var closeCount = 0;

    es.onmessage = function (event) {
      if (+event.lastEventId === 2) {
        closeCount = 1000;
        es.close();
        ok(false, "lastEventId should not be set when connection dropped without data dispatch (see http://www.w3.org/Bugs/Public/show_bug.cgi?id=13761 )");
        start();
      }
    };

    es.onerror = function () {
      closeCount++;
      if (closeCount === 3) {
        es.close();
        ok(true, "ok");
        start();
      }
    };
  });


  asyncTest("EventTarget exceptions throwed from listeners should not stop dispathing", function () {
    var body = "data: test\n\n";
    var es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + body));

    var s = "";
    es.addEventListener("message", function () {
      s += "1";
      throw new Error("test");
    });
    es.addEventListener("message", function () {
      s += "2";
    });
    es.onerror = function () {
      es.close();
      strictEqual(s, "12", "!");
      start();
    };

  });

/*
// Chrome: 0
// Opera, Firefox: 03
// IE 9-10: 023
// EventEmitter node.js: 023

  asyncTest("EventTarget addEventListener/removeEventListener", function () {
    var body = "data: test\n\n";
    var es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + body));
    var s = "";
    var listeners = {};
    function a(n) {
      return listeners[n] || (listeners[n] = function () {
        s += n;
        if (n === 0) {
          es.removeEventListener("message", a(0));
          es.removeEventListener("message", a(2));
          es.addEventListener("message", a(4));
          setTimeout(function () {
            es.close();
            strictEqual(s, "03", "EventTarget");
            start();
          }, 0);
        }
      });
    }
    es.addEventListener("message", a(0));
    es.addEventListener("message", a(1));
    es.addEventListener("message", a(2));
    es.addEventListener("message", a(3));
    es.removeEventListener("message", a(1));
  });
*/

  // https://developer.mozilla.org/en/DOM/element.removeEventListener#Browser_compatibility
  // optional useCapture

  asyncTest("EventSource test 3", function () {
    var body = "data: data0";
    var es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + body));
    var s = "";
    var f = function () {
      es.onerror = es.onmessage = null;
      es.close();
      strictEqual(s, "", "Once the end of the file is reached, any pending data must be discarded. (If the file ends in the middle of an event, before the final empty line, the incomplete event is not dispatched.)");
      start();
    };
    es.onmessage = function (e) {
      s = e.data;
      f();
    };
    es.onerror = function () {
      f();
    };
  });

  asyncTest("EventSource#close()", function () {
    var body = "data: data0;\n\ndata: data1;\n\ndata: data2;\n\n";
    var es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + body));
    var s = "";
    es.onmessage = function () {
      if (s === "") {
        setTimeout(function () {
          es.close();
          ok(s === "1", "http://www.w3.org/Bugs/Public/show_bug.cgi?id=14331");
          start();
        }, 200);
      }
      s += "1";
      es.close();
    };
  });

  asyncTest("EventSource#close()", function () {
    var body = "";
    var es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + body));
    es.onopen = function () {
      strictEqual(es.readyState, 1);
      start();
      es.close();
    };
  });

  // Native EventSource + CORS: Opera 12, Firefox 11, Chrome 26 (WebKit 537.27)
  asyncTest("EventSource CORS", function () {
    var body = "id: <lastEventId(100)>\n" +
               "data: 0\n\n";
    var es = new EventSource(url4CORS + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + body));

    es.onmessage = function (event) {
      if (event.lastEventId === "200") {
        ok(true, "ok");
        start();
        es.close();
      }
    };
    es.onerror = function () {
      if (es.readyState === es.CLOSED) {
        ok(false, "not ok");
        start();
        es.close();
      }
    };
  });

  // buggy with native EventSource in Opera - DSK-362337
  asyncTest("event-stream with \"message\", \"error\", \"open\" events", function () {
    var body = "data: a\n\n" +
               "event: open\ndata: b\n\n" +
               "event: message\ndata: c\n\n" +
               "event: error\ndata: d\n\n" +
               "event:\ndata: e\n\n" +
               "event: end\ndata: f\n\n";
    var es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + body));
    var s = "";
    function handler(event) {
      s += event.data || "";
    }
    es.addEventListener("open", handler);
    es.addEventListener("message", handler);
    es.addEventListener("error", handler);
    es.addEventListener("end", handler);
    es.onerror = function (event) {
      if (!event.data) {// !(event instanceof MessageEvent)
        strictEqual(s, "abcdef");
        start();
        es.close();
      }
    };
  });

  //IE 8 - 9 issue, Native EventSource in Opera 12
  asyncTest("event-stream null character", function () {
    var body = "data: a\n\n" +
               "data: \x00\n\n" +
               "data: b\n\n";
    var es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + body));
    var ok = false;
    es.addEventListener("message", function (event) {
      if (event.data === "\x00") {
        ok = true;
      }
    });
    es.onerror = function () {
      es.close();
      strictEqual(true, ok);
      start();
    };
  });

  asyncTest("EventSource retry delay - see http://code.google.com/p/chromium/issues/detail?id=86230", function () {
    var body = "retry: 800\n\n";
    var es = new EventSource(url + "?estest=" + encodeURIComponent(commonHeaders + "\n\n" + body));
    var s = 0;
    es.onopen = function () {
      if (!s) {
        s = +new Date();
      } else {
        es.close();
        s = +new Date() - s;
        ok(s >= 750, "!" + s);
        start();
      }
    };
  });

  asyncTest("infinite reconnection", function () {
    var es = new EventSource("http://functionfunction" + Math.floor(Math.random() * 1e10) + ".org");
    var n = 0;
    es.onerror = function () {
      ++n;
      if (es.readyState === 2) {
        es.close();
        ok(false, "!");
        start();
      } else {
        if (n === 5) {
          es.close();
          ok(true, "!");
          start();
        }
      }
    };
  });

};
