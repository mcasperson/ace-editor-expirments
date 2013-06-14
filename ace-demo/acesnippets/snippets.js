/*
    Copied from demo.js - https://github.com/ajaxorg/ace/blob/master/demo/kitchen-sink/demo.js
*/
define('ace/snippets', ['require', 'exports', 'module' , 'ace/lib/lang', 'ace/range', 'ace/keyboard/hash_handler', 'ace/tokenizer', 'ace/lib/dom'], function(require, exports, module) {

    var lang = require("./lib/lang")
    var Range = require("./range").Range
    var HashHandler = require("./keyboard/hash_handler").HashHandler;
    var Tokenizer = require("./tokenizer").Tokenizer;
    var comparePoints = Range.comparePoints;

    var SnippetManager = function() {
        this.snippetMap = {};
        this.snippetNameMap = {};
    };

    (function() {
        this.getTokenizer = function() {
            function TabstopToken(str, _, stack) {
                str = str.substr(1);
                if (/^\d+$/.test(str) && !stack.inFormatString)
                    return [{tabstopId: parseInt(str, 10)}];
                return [{text: str}]
            }
            function escape(ch) {
                return "(?:[^\\\\" + ch + "]|\\\\.)";
            }
            SnippetManager.$tokenizer = new Tokenizer({
                start: [
                    {regex: /:/, onMatch: function(val, state, stack) {
                        if (stack.length && stack[0].expectIf) {
                            stack[0].expectIf = false;
                            stack[0].elseBranch = stack[0];
                            return [stack[0]];
                        }
                        return ":";
                    }},
                    {regex: /\\./, onMatch: function(val, state, stack) {
                        var ch = val[1];
                        if (ch == "}" && stack.length) {
                            val = ch;
                        }else if ("`$\\".indexOf(ch) != -1) {
                            val = ch;
                        } else if (stack.inFormatString) {
                            if (ch == "n")
                                val = "\n";
                            else if (ch == "t")
                                val = "\n";
                            else if ("ulULE".indexOf(ch) != -1) {
                                val = {changeCase: ch, local: ch > "a"};
                            }
                        }

                        return [val];
                    }},
                    {regex: /}/, onMatch: function(val, state, stack) {
                        return [stack.length ? stack.shift() : val];
                    }},
                    {regex: /\$(?:\d+|\w+)/, onMatch: TabstopToken},
                    {regex: /\$\{[\dA-Z_a-z]+/, onMatch: function(str, state, stack) {
                        var t = TabstopToken(str.substr(1), state, stack);
                        stack.unshift(t[0]);
                        return t;
                    }, next: "snippetVar"},
                    {regex: /\n/, token: "newline", merge: false}
                ],
                snippetVar: [
                    {regex: "\\|" + escape("\\|") + "*\\|", onMatch: function(val, state, stack) {
                        stack[0].choices = val.slice(1, -1).split(",");
                    }, next: "start"},
                    {regex: "/(" + escape("/") + "+)/(?:(" + escape("/") + "*)/)(\\w*):?",
                        onMatch: function(val, state, stack) {
                            var ts = stack[0];
                            ts.fmtString = val;

                            val = this.splitRegex.exec(val);
                            ts.guard = val[1];
                            ts.fmt = val[2];
                            ts.flag = val[3];
                            return "";
                        }, next: "start"},
                    {regex: "`" + escape("`") + "*`", onMatch: function(val, state, stack) {
                        stack[0].code = val.splice(1, -1);
                        return "";
                    }, next: "start"},
                    {regex: "\\?", onMatch: function(val, state, stack) {
                        if (stack[0])
                            stack[0].expectIf = true;
                    }, next: "start"},
                    {regex: "([^:}\\\\]|\\\\.)*:?", token: "", next: "start"}
                ],
                formatString: [
                    {regex: "/(" + escape("/") + "+)/", token: "regex"},
                    {regex: "", onMatch: function(val, state, stack) {
                        stack.inFormatString = true;
                    }, next: "start"}
                ]
            });
            SnippetManager.prototype.getTokenizer = function() {
                return SnippetManager.$tokenizer;
            }
            return SnippetManager.$tokenizer;
        };

        this.tokenizeTmSnippet = function(str, startState) {
            return this.getTokenizer().getLineTokens(str, startState).tokens.map(function(x) {
                return x.value || x;
            });
        };

        this.$getDefaultValue = function(editor, name) {
            if (/^[A-Z]\d+$/.test(name)) {
                var i = name.substr(1);
                return (this.variables[name[0] + "__"] || {})[i];
            }
            if (/^\d+$/.test(name)) {
                return (this.variables.__ || {})[name];
            }
            name = name.replace(/^TM_/, "");

            if (!editor)
                return;
            var s = editor.session;
            switch(name) {
                case "CURRENT_WORD":
                    var r = s.getWordRange();
                case "SELECTION":
                case "SELECTED_TEXT":
                    return s.getTextRange(r);
                case "CURRENT_LINE":
                    return s.getLine(e.getCursorPosition().row);
                case "LINE_INDEX":
                    return e.getCursorPosition().column;
                case "LINE_NUMBER":
                    return e.getCursorPosition().row + 1;
                case "SOFT_TABS":
                    return s.getUseSoftTabs() ? "YES" : "NO";
                case "TAB_SIZE":
                    return s.getTabSize();
                case "FILENAME":
                case "FILEPATH":
                    return "ace.ajax.org";
                case "FULLNAME":
                    return "Ace";
            }
        };
        this.variables = {};
        this.getVariableValue = function(editor, varName) {
            if (this.variables.hasOwnProperty(varName))
                return this.variables[varName](editor, varName) || "";
            return this.$getDefaultValue(editor, varName) || "";
        };
        this.tmStrFormat = function(str, ch, editor) {
            var flag = ch.flag || "";
            var re = ch.guard;
            re = new RegExp(re, flag.replace(/[^gi]/, ""));
            var fmtTokens = this.tokenizeTmSnippet(ch.fmt, "formatString");
            var _self = this;
            var formatted = str.replace(re, function() {
                _self.variables.__ = arguments;
                var fmtParts = _self.resolveVariables(fmtTokens, editor);
                var gChangeCase = "E";
                for (var i  = 0; i < fmtParts.length; i++) {
                    var ch = fmtParts[i];
                    if (typeof ch == "object") {
                        fmtParts[i] = "";
                        if (ch.changeCase && ch.local) {
                            var next = fmtParts[i + 1];
                            if (next && typeof next == "string") {
                                if (ch.changeCase == "u")
                                    fmtParts[i] = next[0].toUpperCase();
                                else
                                    fmtParts[i] = next[0].toLowerCase();
                                fmtParts[i + 1] = next.substr(1);
                            }
                        } else if (ch.changeCase) {
                            gChangeCase = ch.changeCase;
                        }
                    } else if (gChangeCase == "U") {
                        fmtParts[i] = ch.toUpperCase();
                    } else if (gChangeCase == "L") {
                        fmtParts[i] = ch.toLowerCase();
                    }
                }
                return fmtParts.join("");
            });
            this.variables.__ = null;
            return formatted;
        };

        this.resolveVariables = function(snippet, editor) {
            var result = [];
            for (var i = 0; i < snippet.length; i++) {
                var ch = snippet[i];
                if (typeof ch == "string") {
                    result.push(ch);
                } else if (typeof ch != "object") {
                    continue;
                } else if (ch.skip) {
                    gotoNext(ch);
                } else if (ch.processed < i) {
                    continue;
                } else if (ch.text) {
                    var value = this.getVariableValue(editor, ch.text);
                    if (value && ch.fmtString)
                        value = this.tmStrFormat(value, ch);
                    ch.processed = i;
                    if (ch.expectIf == null) {
                        if (value) {
                            result.push(value);
                            gotoNext(ch);
                        }
                    } else {
                        if (value) {
                            ch.skip = ch.elseBranch;
                        } else
                            gotoNext(ch);
                    }
                } else if (ch.tabstopId != null) {
                    result.push(ch);
                } else if (ch.changeCase != null) {
                    result.push(ch);
                }
            }
            function gotoNext(ch) {
                var i1 = snippet.indexOf(ch, i + 1);
                if (i1 != -1)
                    i = i1;
            }
            return result;
        };

        this.insertSnippet = function(editor, snippetText) {
            var cursor = editor.getCursorPosition();
            var line = editor.session.getLine(cursor.row);
            var indentString = line.match(/^\s*/)[0];
            var tabString = editor.session.getTabString();

            var tokens = this.tokenizeTmSnippet(snippetText);
            tokens = this.resolveVariables(tokens, editor);
            tokens = tokens.map(function(x) {
                if (x == "\n")
                    return x + indentString;
                if (typeof x == "string")
                    return x.replace(/\t/g, tabString);
                return x;
            });
            var tabstops = [];
            tokens.forEach(function(p, i) {
                if (typeof p != "object")
                    return;
                var id = p.tabstopId;
                if (!tabstops[id]) {
                    tabstops[id] = [];
                    tabstops[id].index = id;
                    tabstops[id].value = "";
                }
                if (tabstops[id].indexOf(p) != -1)
                    return;
                tabstops[id].push(p);
                var i1 = tokens.indexOf(p, i + 1);
                if (i1 == -1)
                    return;
                var value = tokens.slice(i + 1, i1).join("");
                if (value)
                    tabstops[id].value = value;
            });

            tabstops.forEach(function(ts) {
                ts.value && ts.forEach(function(p) {
                    var i = tokens.indexOf(p);
                    var i1 = tokens.indexOf(p, i + 1);
                    if (i1 == -1)
                        tokens.splice(i + 1, 0, ts.value, p);
                    else if (i1 == i + 1)
                        tokens.splice(i + 1, 0, ts.value);
                });
            });
            var row = 0, column = 0;
            var text = "";
            tokens.forEach(function(t) {
                if (typeof t == "string") {
                    if (t[0] == "\n"){
                        column = t.length - 1;
                        row ++;
                    } else
                        column += t.length;
                    text += t;
                } else {
                    if (!t.start)
                        t.start = {row: row, column: column};
                    else
                        t.end = {row: row, column: column};
                }
            });
            var range = editor.getSelectionRange();
            var end = editor.session.replace(range, text);

            var tabstopManager = new TabstopManager(editor);
            tabstopManager.addTabstops(tabstops, range.start, end);
            tabstopManager.tabNext();
        };

        this.$getScope = function(editor) {
            var scope = editor.session.$mode.$id || "";
            scope = scope.split("/").pop();
            if (editor.session.$mode.$modes) {
                var c = editor.getCursorPosition()
                var state = editor.session.getState(c.row);
                if (state.substring) {
                    if (state.substring(0, 3) == "js-")
                        scope = "javascript";
                    else if (state.substring(0, 4) == "css-")
                        scope = "css";
                    else if (state.substring(0, 4) == "php-")
                        scope = "php";
                }
            }
            return scope;
        };

        this.expandWithTab = function(editor) {
            var cursor = editor.getCursorPosition();
            var line = editor.session.getLine(cursor.row);
            var before = line.substring(0, cursor.column);
            var after = line.substr(cursor.column);

            var scope = this.$getScope(editor);
            var snippetMap = this.snippetMap;
            var snippet;
            [scope, "_"].some(function(scope) {
                var snippets = snippetMap[scope];
                if (snippets)
                    snippet = this.findMatchingSnippet(snippets, before, after);
                return !!snippet;
            }, this);
            if (!snippet)
                return false;

            editor.session.doc.removeInLine(cursor.row,
                cursor.column - snippet.replaceBefore.length,
                cursor.column + snippet.replaceAfter.length
            );

            this.variables.M__ = snippet.matchBefore;
            this.variables.T__ = snippet.matchAfter;
            this.insertSnippet(editor, snippet.content);

            this.variables.M__ = this.variables.T__ = null;
            return true;
        };

        this.findMatchingSnippet = function(snippetList, before, after) {
            for (var i = snippetList.length; i--;) {
                var s = snippetList[i];
                if (s.startRe && !s.startRe.test(before))
                    continue;
                if (s.endRe && !s.endRe.test(after))
                    continue;
                if (!s.startRe && !s.endRe)
                    continue;

                s.matchBefore = s.startRe ? s.startRe.exec(before) : [""];
                s.matchAfter = s.endRe ? s.endRe.exec(after) : [""];
                s.replaceBefore = s.triggerRe ? s.triggerRe.exec(before)[0] : "";
                s.replaceAfter = s.endTriggerRe ? s.endTriggerRe.exec(after)[0] : "";
                return s;
            }
        };

        this.snippetMap = {};
        this.snippetNameMap = {};
        this.register = function(snippets, scope) {
            var snippetMap = this.snippetMap;
            var snippetNameMap = this.snippetNameMap;
            var self = this;
            function wrapRegexp(src) {
                if (src && !/^\^?\(.*\)\$?$|^\\b$/.test(src))
                    src = "(?:" + src + ")"

                return src || "";
            }
            function guardedRegexp(re, guard, opening) {
                re = wrapRegexp(re);
                guard = wrapRegexp(guard);
                if (opening) {
                    re = guard + re;
                    if (re && re[re.length - 1] != "$")
                        re = re + "$";
                } else {
                    re = re + guard;
                    if (re && re[0] != "^")
                        re = "^" + re;
                }
                return new RegExp(re);
            }

            function addSnippet(s) {
                if (!s.scope)
                    s.scope = scope || "_";
                scope = s.scope
                if (!snippetMap[scope]) {
                    snippetMap[scope] = [];
                    snippetNameMap[scope] = {};
                }

                var map = snippetNameMap[scope];
                if (s.name) {
                    var old = map[s.name];
                    if (old)
                        self.unregister(old);
                    map[s.name] = s;
                }
                snippetMap[scope].push(s);

                if (s.tabTrigger && !s.trigger) {
                    if (!s.guard && /^\w/.test(s.tabTrigger))
                        s.guard = "\\b";
                    s.trigger = lang.escapeRegExp(s.tabTrigger);
                }

                s.startRe = guardedRegexp(s.trigger, s.guard, true);
                s.triggerRe = new RegExp(s.trigger, "", true);

                s.endRe = guardedRegexp(s.endTrigger, s.endGuard, true);
                s.endTriggerRe = new RegExp(s.endTrigger, "", true);
            };

            if (snippets.content)
                addSnippet(snippets);
            else if (Array.isArray(snippets))
                snippets.forEach(addSnippet);
        };
        this.unregister = function(snippets, scope) {
            var snippetMap = this.snippetMap;
            var snippetNameMap = this.snippetNameMap;

            function removeSnippet(s) {
                var map = snippetNameMap[scope];
                if (map && map[s.name]) {
                    delete map[s.name];
                    map = snippetMap[scope];
                    var i = map && map.indexOf(s);
                    if (i >= 0)
                        map.splice(i, 1);
                }
            }
            if (snippets.content)
                removeSnippet(snippets);
            else if (Array.isArray(snippets))
                snippets.forEach(removeSnippet);
        };
        this.parseSnippetFile = function(str) {
            str = str.replace(/\r/, "");
            var list = [], snippet = {};
            var re = /^#.*|^({[\s\S]*})\s*$|^(\S+) (.*)$|^((?:\n*\t.*)+)/gm;
            var m;
            while (m = re.exec(str)) {
                if (m[1]) {
                    try {
                        snippet = JSON.parse(m[1])
                        list.push(snippet);
                    } catch (e) {}
                } if (m[4]) {
                    snippet.content = m[4].replace(/^\t/gm, "");
                    list.push(snippet);
                    snippet = {};
                } else {
                    var key = m[2], val = m[3];
                    if (key == "regex") {
                        var guardRe = /\/((?:[^\/\\]|\\.)*)|$/g;
                        snippet.guard = guardRe.exec(val)[1];
                        snippet.trigger = guardRe.exec(val)[1];
                        snippet.endTrigger = guardRe.exec(val)[1];
                        snippet.endGuard = guardRe.exec(val)[1];
                    } else if (key == "snippet") {
                        snippet.tabTrigger = val.match(/^\S*/)[0];
                        if (!snippet.name)
                            snippet.name = val;
                    } else {
                        snippet[key] = val;
                    }
                }
            }
            return list;
        };
        this.getSnippetByName = function(name, editor) {
            var scope = editor && this.$getScope(editor);
            var snippetMap = this.snippetNameMap;
            var snippet;
            [scope, "_"].some(function(scope) {
                var snippets = snippetMap[scope];
                if (snippets)
                    snippet = snippets[name];
                return !!snippet;
            }, this);
            return snippet;
        };

    }).call(SnippetManager.prototype);

    var TabstopManager = function(editor) {
        if (editor.tabstopManager)
            return editor.tabstopManager;
        editor.tabstopManager = this;
        this.$onChange = this.onChange.bind(this);
        this.$onChangeSelection = lang.delayedCall(this.onChangeSelection.bind(this)).schedule;
        this.$onChangeSession = this.onChangeSession.bind(this);
        this.$onAfterExec = this.onAfterExec.bind(this);
        this.attach(editor);
    };
    (function() {
        this.attach = function(editor) {
            this.index = -1;
            this.ranges = [];
            this.tabstops = [];
            this.selectedTabstop = null;

            this.editor = editor;
            this.editor.on("change", this.$onChange);
            this.editor.on("changeSelection", this.$onChangeSelection);
            this.editor.on("changeSession", this.$onChangeSession);
            this.editor.commands.on("afterExec", this.$onAfterExec);
            this.editor.keyBinding.addKeyboardHandler(this.keyboardHandler);
        };
        this.detach = function() {
            this.tabstops.forEach(this.removeTabstopMarkers, this);
            this.ranges = null;
            this.tabstops = null;
            this.selectedTabstop = null;
            this.editor.removeListener("change", this.$onChange);
            this.editor.removeListener("changeSelection", this.$onChangeSelection);
            this.editor.removeListener("changeSession", this.$onChangeSession);
            this.editor.commands.removeListener("afterExec", this.$onAfterExec);
            this.editor.keyBinding.removeKeyboardHandler(this.keyboardHandler);
            this.editor.tabstopManager = null;
            this.editor = null;
        };

        this.onChange = function(e) {
            var changeRange = e.data.range;
            var isRemove = e.data.action[0] == "r";
            var start = changeRange.start;
            var end = changeRange.end;
            var startRow = start.row;
            var endRow = end.row;
            var lineDif = endRow - startRow;
            var colDiff = end.column - start.column;

            if (isRemove) {
                lineDif = -lineDif;
                colDiff = -colDiff;
            }
            if (!this.$inChange && isRemove) {
                var ts = this.selectedTabstop;
                var changedOutside = !ts.some(function(r) {
                    return comparePoints(r.start, start) <= 0 && comparePoints(r.end, end) >= 0;
                });
                if (changedOutside)
                    return this.detach();
            }
            var ranges = this.ranges;
            for (var i = 0; i < ranges.length; i++) {
                var r = ranges[i];
                if (r.end.row < start.row)
                    continue;

                if (comparePoints(start, r.start) < 0 && comparePoints(end, r.end) > 0) {
                    this.removeRange(r);
                    i--;
                    continue;
                }

                if (r.start.row == startRow && r.start.column > start.column)
                    r.start.column += colDiff;
                if (r.end.row == startRow && r.end.column >= start.column)
                    r.end.column += colDiff;
                if (r.start.row >= startRow)
                    r.start.row += lineDif;
                if (r.end.row >= startRow)
                    r.end.row += lineDif;

                if (comparePoints(r.start, r.end) > 0)
                    this.removeRange(r);
            }
            if (!ranges.length)
                this.detach();
        };
        this.updateLinkedFields = function() {
            var ts = this.selectedTabstop;
            if (!ts.hasLinkedRanges)
                return;
            this.$inChange = true;
            var session = this.editor.session;
            var text = session.getTextRange(ts.firstNonLinked);
            for (var i = ts.length; i--;) {
                var range = ts[i];
                if (!range.linked)
                    continue;
                var fmt = exports.snippetManager.tmStrFormat(text, range.original)
                session.replace(range, fmt);
            }
            this.$inChange = false;
        };
        this.onAfterExec = function(e) {
            if (e.command && !e.command.readOnly)
                this.updateLinkedFields();
        };
        this.onChangeSelection = function() {
            if (!this.editor)
                return
            var lead = this.editor.selection.lead;
            var anchor = this.editor.selection.anchor;
            var isEmpty = this.editor.selection.isEmpty();
            for (var i = this.ranges.length; i--;) {
                if (this.ranges[i].linked)
                    continue;
                var containsLead = this.ranges[i].contains(lead.row, lead.column);
                var containsAnchor = isEmpty || this.ranges[i].contains(anchor.row, anchor.column);
                if (containsLead && containsAnchor)
                    return;
            }
            this.detach();
        };
        this.onChangeSession = function() {
            this.detach();
        };
        this.tabNext = function(dir) {
            var max = this.tabstops.length - 1;
            var index = this.index + (dir || 1);
            index = Math.min(Math.max(index, 0), max);
            this.selectTabstop(index);
            if (index == max)
                this.detach();
        };
        this.selectTabstop = function(index) {
            var ts = this.tabstops[this.index];
            if (ts)
                this.addTabstopMarkers(ts);
            this.index = index;
            ts = this.tabstops[this.index];
            if (!ts || !ts.length)
                return;

            this.selectedTabstop = ts;
            var sel = this.editor.multiSelect;
            sel.toSingleRange(ts.firstNonLinked.clone());
            for (var i = ts.length; i--;) {
                if (ts.hasLinkedRanges && ts[i].linked)
                    continue;
                sel.addRange(ts[i].clone(), true);
            }
            this.editor.keyBinding.addKeyboardHandler(this.keyboardHandler);
        };
        this.addTabstops = function(tabstops, start, end) {
            if (!tabstops[0]) {
                var p = Range.fromPoints(end, end);
                moveRelative(p.start, start);
                moveRelative(p.end, start);
                tabstops[0] = [p];
                tabstops[0].index = 0;
            }

            var i = this.index;
            var arg = [i, 0];
            var ranges = this.ranges;
            var editor = this.editor;
            tabstops.forEach(function(ts) {
                for (var i = ts.length; i--;) {
                    var p = ts[i];
                    var range = Range.fromPoints(p.start, p.end || p.start);
                    movePoint(range.start, start);
                    movePoint(range.end, start);
                    range.original = p;
                    range.tabstop = ts;
                    ranges.push(range);
                    ts[i] = range;
                    if (p.fmtString) {
                        range.linked = true;
                        ts.hasLinkedRanges = true;
                    } else if (!ts.firstNonLinked)
                        ts.firstNonLinked = range;
                }
                if (!ts.firstNonLinked)
                    ts.hasLinkedRanges = false;
                arg.push(ts);
                this.addTabstopMarkers(ts);
            }, this);
            arg.push(arg.splice(2, 1)[0]);
            this.tabstops.splice.apply(this.tabstops, arg);
        };

        this.addTabstopMarkers = function(ts) {
            var session = this.editor.session;
            ts.forEach(function(range) {
                if  (!range.markerId)
                    range.markerId = session.addMarker(range, "ace_snippet-marker", "text");
            });
        };
        this.removeTabstopMarkers = function(ts) {
            var session = this.editor.session;
            ts.forEach(function(range) {
                session.removeMarker(range.markerId);
                range.markerId = null;
            });
        };
        this.removeRange = function(range) {
            var i = range.tabstop.indexOf(range);
            range.tabstop.splice(i, 1);
            i = this.ranges.indexOf(range);
            this.ranges.splice(i, 1);
            this.editor.session.removeMarker(range.markerId);
        };

        this.keyboardHandler = new HashHandler();
        this.keyboardHandler.bindKeys({
            "Tab": function(ed) {
                ed.tabstopManager.tabNext(1);
            },
            "Shift-Tab": function(ed) {
                ed.tabstopManager.tabNext(-1);
            },
            "Esc": function(ed) {
                ed.tabstopManager.detach();
            },
            "Return": function(ed) {
                return false;
            }
        });
    }).call(TabstopManager.prototype);


    var movePoint = function(point, diff) {
        if (point.row == 0)
            point.column += diff.column;
        point.row += diff.row;
    };

    var moveRelative = function(point, start) {
        if (point.row == start.row)
            point.column -= start.column;
        point.row -= start.row;
    };


    require("./lib/dom").importCssString("\
.ace_snippet-marker {\
    -moz-box-sizing: border-box;\
    box-sizing: border-box;\
    background: rgba(194, 193, 208, 0.09);\
    border: 1px dotted rgba(211, 208, 235, 0.62);\
    position: absolute;\
}");

    exports.snippetManager = new SnippetManager();

    var jsSnippets = require("ace/snippets/javascript");
    jsSnippets.snippets = exports.snippetManager.parseSnippetFile(jsSnippets.snippetText);
    exports.snippetManager.register(jsSnippets.snippets, "xml")

});

define('ace/snippets/javascript', ['require', 'exports', 'module' ], function(require, exports, module) {

exports.snippetText = "snippet CDATA\n\
	<![CDATA[\n\
	${1:content}\n\
	]]>\n\
snippet figure\n\
	<figure>\n\
		<title>${1:title}</title>\n\
		<mediaobject>\n\
			<imageobject>\n\
				<imagedata align='center' fileref='images/${2:imageid}.png'/>\n\
			</imageobject>\n\
			<textobject>\n\
				<phrase>${3:description}</phrase>\n\
			</textobject>\n\
		</mediaobject>\n\
	</figure>\n\
snippet formalpara\n\
	<formalpara>\n\
		<title>${1:title}</title>\n\
		<para>\n\
			${2:para}\n\
		</para>\n\
	</formalpara>\n\
snippet itemizedlist\n\
	<itemizedlist> \n\
		<listitem>\n\
			<para>\n\
				${1:para}\n\
			</para>\n\
		</listitem>\n\
	</itemizedlist>\n\
snippet keycombo\n\
	<keycombo>\n\
		<keycap>${1:CTRL}</keycap>\n\
		<mousebutton>${2:Button1}</mousebutton>\n\
	</keycombo>\n\
snippet listitem\n\
	<listitem>\n\
		<para>\n\
			${1:para}\n\
		</para>\n\
	</listitem>\n\
snippet menuchoice\n\
	<menuchoice><guimenu>${1:File}</guimenu><guimenuitem>${2:Open}</guimenuitem></menuchoice>\n\
snippet note\n\
	<note>\n\
		<para>\n\
			${1:para}\n\
		</para>\n\
	</note>\n\
snippet orderedlist\n\
	<orderedlist>\n\
		<listitem>\n\
			<para>\n\
				${1:para}\n\
			</para>\n\
		</listitem>\n\
	</orderedlist>\n\
snippet procedure\n\
	<procedure>\n\
		<title>${1:title}</title>\n\
		<step>\n\
			<para>\n\
				${2:para}\n\
			</para>\n\
		</step>\n\
	</procedure>\n\
snippet programlisting\n\
	<programlisting><![CDATA[\n\
	${1:code}\n\
	]]></programlisting>\n\
snippet programlistingjava\n\
	<programlisting language='Java' role='JAVA'><![CDATA[\n\
	${1:code}\n\
	]]></programlisting>\n\
snippet programlistingxml\n\
	<programlisting language='XML' role='XML'><![CDATA[\n\
	${1:code}\n\
	]]\n\
	</programlisting>\n\
snippet section\n\
	<section>\n\
		<title>${1:title}</title>\n\
		<para>\n\
			${2:para}\n\
		</para>\n\
	</section>\n\
snippet step\n\
	<step>\n\
		<para>\n\
			${1:para}\n\
		</para>\n\
	</step>\n\
snippet table\n\
	<table frame='all'>\n\
		<title>${1:title}</title>\n\
		<tgroup cols='2' align='left' colsep='1' rowsep='1'>\n\
			<colspec colname='c1'/>\n\
			<colspec colname='c2'/>\n\
			<thead>\n\
				<row>\n\
					<entry>Header Row 0 Col 0</entry>\n\
					<entry>Header Row 0 Col 1</entry>\n\
				</row>\n\
			</thead>\n\
			<tbody>\n\
				<row>\n\
					<entry>Row 1 Col 0</entry>\n\
					<entry>Row 1 Col 1</entry>\n\
				</row>\n\
				<row>\n\
					<entry>Row 2 Col 0</entry>\n\
					<entry>Row 2 Col 1</entry> \n\
				</row>\n\
			</tbody>\n\
		</tgroup>\n\
	</table>\n\
snippet table3\n\
	<table frame='all'>\n\
		<title>${1:title}</title>\n\
		<tgroup cols='3' align='left' colsep='1' rowsep='1'>\n\
			<colspec colname='c1'/>\n\
			<colspec colname='c2'/>\n\
			<colspec colname='c3'/>\n\
			<thead>\n\
				<row>\n\
					<entry>Header Row 0 Col 0</entry>\n\
					<entry>Header Row 0 Col 1</entry>\n\
					<entry>Header Row 0 Col 2</entry>\n\
				</row>\n\
			</thead>\n\
			<tbody>\n\
				<row>\n\
					<entry>Row 1 Col 0</entry>\n\
					<entry>Row 1 Col 1</entry>\n\
					<entry>Row 1 Col 2</entry>\n\
				</row>\n\
				<row>\n\
					<entry>Row 2 Col 0</entry>\n\
					<entry>Row 2 Col 1</entry> \n\
					<entry>Row 2 Col 2</entry> \n\
				</row>\n\
			</tbody>\n\
		</tgroup>\n\
	</table>\n\
snippet table4\n\
	<table frame='all'>\n\
		<title>${1:title}</title>\n\
		<tgroup cols='4' align='left' colsep='1' rowsep='1'>\n\
			<colspec colname='c1'/>\n\
			<colspec colname='c2'/>\n\
			<colspec colname='c3'/>\n\
			<colspec colname='c4'/>\n\
			<thead>\n\
				<row>\n\
					<entry>Header Row 0 Col 0</entry>\n\
					<entry>Header Row 0 Col 1</entry>\n\
					<entry>Header Row 0 Col 2</entry>\n\
					<entry>Header Row 0 Col 3</entry>\n\
				</row>\n\
			</thead>\n\
			<tbody>\n\
				<row>\n\
					<entry>Row 1 Col 0</entry>\n\
					<entry>Row 1 Col 1</entry>\n\
					<entry>Row 1 Col 2</entry>\n\
					<entry>Row 1 Col 3</entry>\n\
				</row>\n\
				<row>\n\
					<entry>Row 2 Col 0</entry>\n\
					<entry>Row 2 Col 1</entry> \n\
					<entry>Row 2 Col 2</entry> \n\
					<entry>Row 2 Col 3</entry> \n\
				</row>\n\
			</tbody>\n\
		</tgroup>\n\
	</table>\n\
snippet table5\n\
	<table frame='all'>\n\
		<title>${1:title}</title>\n\
		<tgroup cols='5' align='left' colsep='1' rowsep='1'>\n\
			<colspec colname='c1'/>\n\
			<colspec colname='c2'/>\n\
			<colspec colname='c3'/>\n\
			<colspec colname='c4'/>\n\
			<colspec colname='c5'/>\n\
			<thead>\n\
				<row>\n\
					<entry>Header Row 0 Col 0</entry>\n\
					<entry>Header Row 0 Col 1</entry>\n\
					<entry>Header Row 0 Col 2</entry>\n\
					<entry>Header Row 0 Col 3</entry>\n\
					<entry>Header Row 0 Col 4</entry>\n\
				</row>\n\
			</thead>\n\
			<tbody>\n\
				<row>\n\
					<entry>Row 1 Col 0</entry>\n\
					<entry>Row 1 Col 1</entry>\n\
					<entry>Row 1 Col 2</entry>\n\
					<entry>Row 1 Col 3</entry>\n\
					<entry>Row 1 Col 4</entry>\n\
				</row>\n\
				<row>\n\
					<entry>Row 2 Col 0</entry>\n\
					<entry>Row 2 Col 1</entry> \n\
					<entry>Row 2 Col 2</entry> \n\
					<entry>Row 2 Col 3</entry> \n\
					<entry>Row 2 Col 4</entry> \n\
				</row>\n\
			</tbody>\n\
		</tgroup>\n\
	</table>\n\
snippet ulink\n\
	<ulink url='${1:url}'>${2:title}</ulink>\n\
snippet variablelist\n\
	<variablelist>\n\
		<title>${1:title}</title>\n\
		<varlistentry>\n\
			<term>\n\
				${2:term}\n\
			</term>\n\
			<listitem>\n\
				<para>\n\
					${3:para}\n\
				</para>\n\
			</listitem>\n\
		</varlistentry>\n\
	</variablelist>\n\
snippet variablelistentry\n\
	<varlistentry>\n\
		<term>\n\
			${1:term}\n\
		</term>\n\
		<listitem>\n\
			<para>\n\
				${2:para}\n\
			</para>\n\
		</listitem>\n\
	</varlistentry>\n\
snippet xref\n\
	<xref linkend='${1:id}'/>\n\
snippet important\n\
	<important>\n\
		<para>\n\
			${1:para}\n\
		</para>\n\
	</important>\n\
snippet warning\n\
	<warning>\n\
		<para>\n\
			${1:para}\n\
		</para>\n\
	</warning>\n\
snippet footnote\n\
	<footnote>\n\
		<para>\n\
			${1:para}\n\
		</para>\n\
	</footnote>\n\
snippet indexterm1\n\
	<indexterm id='${1:ID}'><primary>${2:primary}</primary></indexterm>\n\
snippet indexterm2\n\
	<indexterm id='${1:ID}'><primary>${2:primary}</primary><secondary>${3:secondary}</secondary></indexterm>\n\
snippet indexterm3\n\
	<indexterm id='${1:ID}'><primary>${2:primary}</primary><secondary>${3:secondary}</secondary><tertiary>${4:tertiary}</tertiary>\n\
snippet injectimage\n\
	<!-- InjectImage: ${1:IMAGE_ID} -->\n\
snippet injectlist\n\
	<!-- InjectList: ${1:TOPIC_ID_COMMA_SEPARATED} -->\n\
snippet injectalphasort\n\
	<!-- InjectListAlphaSort: ${1:TOPIC_ID_COMMA_SEPARATED} -->\n\
snippet injectlistitems\n\
	<!-- InjectListItems: ${1:TOPIC_ID_COMMA_SEPARATED} -->\n\
snippet injectsequence\n\
	<!-- InjectSequence: ${1:TOPIC_ID_COMMA_SEPARATED} -->\n\
snippet injecttext\n\
	<!-- InjectText: ${1:TOPIC_ID} -->\n\
snippet injecttitle\n\
	<!-- InjectTitle: ${1:TOPIC_ID} -->\n\
snippet promptlinux\n\
	<prompt>[user@host ${1:path}]\$</prompt> <userinput>${2:user_input}</userinput>\n\
snippet promptwindows\n\
	<prompt>C:\${1:path}&gt;</prompt> <userinput>${2:user_input}</userinput>\n\
snippet screen\n\
	<screen><![CDATA[${1:screen_output}]]${2:>}</screen>\n\
snippet stepalternatives\n\
	<stepalternatives>\n\
		<step>\n\
			<title>${1:text}</title>\n\
			<para>\n\
				${2:text}\n\
			</para>\n\
		</step>\n\
	</stepalternatives>\n\
snippet substeps\n\
	<substeps>\n\
		<step>\n\
			<title>${1:title}</title>\n\
			<para>\n\
				${2:text}\n\
			</para>\n\
		</step>\n\
	</substeps>\n\
snippet xiinclude\n\
	<xi:include xmlns:xi='http://www.w3.org/2001/XInclude'' href='${1:path_to_file}'/>\n\
";
});

/*var snippetManager = require("ace/snippets").snippetManager

 editor.commands.bindKey("Tab", function(editor) {
 var success = snippetManager.expandWithTab(editor);
 if (!success)
 editor.execCommand("indent");
 })*/
