import AceEditor from "react-ace";
import KeyboardEventHandler from "react-keyboard-event-handler";
import React, { Component } from "react";
import crypto from "crypto";
import deepEqual from "deep-equal";
import produce from "immer";
import uuid from "uuid/v4";
import { debounce, get } from "lodash";

import "brace/mode/javascript";
import "brace/mode/jsx";
import "brace/theme/xcode";

const babel = require("@babel/standalone");

const COLORS = ["purple", "dark-green", "dark-blue", "yellow", "hot-pink"];

const md5 = str =>
  crypto
    .createHash("md5")
    .update(str)
    .digest("hex");

// HACK: save react as window global so we can eval babel
window.React = React;

// FIXME: try-catches here are probably overkill, we can clean this up later
const compileWidget = code => {
  let transformed, transformError;

  try {
    transformed = babel.transform(`(function() { ${code} })()`, {
      presets: ["es2015", "react"],
      plugins: ["proposal-class-properties"]
    });
  } catch (e) {
    transformError = e;
  }

  if (transformError) {
    console.error(transformError);

    return () => <pre className="red">{transformError.toString()}</pre>;
  }

  let evaled, evalError;

  try {
    evaled = eval(transformed.code);
  } catch (e) {
    evalError = e;
  }

  if (evalError) {
    console.error(evalError);

    return () => <pre className="red">{evalError.toString()}</pre>;
  }

  evaled.hash = md5(code);

  return evaled;
};

class Widget extends React.Component {
  state = { error: undefined };

  change(cb) {
    this.props.change(cb);
  }

  componentDidMount() {
    if (this.handleExpectedDocChange) {
      this.handleExpectedDocChange(this.props.doc, this.props.expectedDoc);
    }
  }

  componentDidUpdate(prevProps) {
    if (
      this.handleExpectedDocChange &&
      (!deepEqual(this.props.doc, prevProps.doc) ||
        !deepEqual(this.props.expectedDoc, prevProps.expectedDoc))
    ) {
      this.handleExpectedDocChange(this.props.doc, this.props.expectedDoc);
    }
  }

  render() {
    if (!this.show) {
      return (
        <div>
          <code>this.show</code> not implemented
        </div>
      );
    }

    return this.show(this.props.doc, this.props.expectedDoc);
  }
}
window.Widget = Widget;

const EMPTY_WIDGET = `
const MyWidgetTypes = {
  expects: undefined,
  exposes: undefined
};

return class MyWidget extends Widget {
  static types = MyWidgetTypes;

  show() {
    return (
      <h1>Edit Me!</h1>
    );
  }
}`;

const WIDGETS = {
  "Editable Note": `
const EditableNoteTypes = {
  expects: undefined,
  exposes: "Text"
};

return class EditableNote extends Widget {
  static types = EditableNoteTypes;

  show(doc) {
    return (
      <textarea
        className="m0 bw1 w-100 h-100 b--light-gray"
        value={doc ? doc.exposes : ""}
        onChange={e => {
          const { value } = e.target;

          this.change(doc => {
            if (!doc) { doc = {}; }

            doc.exposes = value;
            return doc;
          });
        }}
      />
    );
  }
}`,

  Table: `
const TableTypes = {
  expects: "Text",
  exposes: "Table"
};

return class Table extends Widget {
  static types = TableTypes;

  handleExpectedDocChange(_, expectedDoc) {
    const newDoc = (expectedDoc || "")
      .split("\\n")
      .filter(line => line.length > 0)
      .map(line => line.split(",").map(text => text.trim()));

    this.change(doc => {
      if (!doc) { doc = {}; }

      doc.exposes = newDoc;
      return doc;
    });
  }

  show(doc) {
    const columns = doc ? doc.exposes : [[" ", " "], [" ", " "]];

    return <table className="collapse ba br2 b--black-10 pa3">
      <tbody>
        {columns.map((column, i) => (
          <tr key={column + i} className="striped--near-white ">
            {column.map((row, j) => (
              <td key={row + j} className="pa2">
                {row}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  }
}`,

  List: `
const ListTypes = {
  expects: "Text",
  exposes: "List"
};

return class List extends Widget {
  static types = ListTypes;

  handleExpectedDocChange(_, expectedDoc) {
    const newDoc = (expectedDoc || "")
      .split("\\n")
      .map(line => line.trim())
      .filter(line => line.startsWith("* ") || line.startsWith("- "))
      .map(line => line.replace("* ", "").replace("- ", ""));

    this.change(doc => {
      if (!doc) { doc = {}; }

      doc.exposes = newDoc;
      return doc;
    });
  }

  show(doc) {
    const list = doc ? doc.exposes : [" "];

    return <ul>
      {list.map((item, i) => (
        <li key={item + i}>
          {item}
        </li>
      ))}
    </ul>
  }
}`,

  Grep: `
const GrepTypes = {
  expects: "Text",
  exposes: "Text"
};

return class Grep extends Widget {
  static types = GrepTypes;

  handleExpectedDocChange(doc, expectedDoc) {
    const hasGrep = doc && doc.grep && doc.grep.length > 0;

    if (!hasGrep) {
      this.change(doc => {
        if (!doc) { doc = {}; }

        doc.exposes = expectedDoc || "";
        return doc;
      });

      return;
    }

    let reg;

    try {
      reg = new RegExp(doc.grep);
    }
    catch(e) {
      console.log(e);
    }

    const newDoc = (expectedDoc || "")
      .split("\\n")
      .filter(line => reg ? line.match(reg) : true)
      .join("\\n");

    this.change(doc => {
      if (!doc) { doc = {}; }

      doc.exposes = newDoc;
      return doc;
    });
  }

  show(doc) {
    return <div>
      <div className="mb2">
        <input
          className="p2 w-100 code f6"
          placeholder="Regular Expression"
          value={doc ? (doc.grep || "") : ""}
          onChange={e => {
            const { value } = e.target;

            this.change(doc => {
              if (!doc) { doc = {}; }

              doc.grep = value;
              return doc;
            })
          }}
        />
      </div>

      <pre className="sans-serif">
        {doc && doc.exposes}
      </pre>
    </div>
  }
}`,

  "Word Count": `
const WordCountTypes = {
  expects: "Text",
  exposes: undefined
};

return class WordCount extends Widget {
  static types = WordCountTypes;

  show(_, doc) {
    return <div>
      Word Count: {
        doc
          ? doc
            .replace(/\\n/g, " ")
            .split(" ")
            .filter(l => l.length > 0)
            .length
          : 0
      }
    </div>
  }
}`
};

const createDocWithContent = ({
  x,
  y,
  w = 300,
  h = 200,
  content,
  contentId,
  widget
}) => {
  contentId = contentId || uuid();

  return {
    doc: {
      // display props
      id: uuid(),
      rect: [x, y, w, h],
      isSelected: true,

      // content id
      contentId,
      expectedContentId: undefined,

      // display
      widget
    },

    content: {
      id: contentId,
      content
    }
  };
};

class TryCatch extends React.Component {
  state = {
    error: undefined
  };

  componentDidCatch(error, info) {
    this.setState({ error });
  }

  render() {
    if (this.state.error) {
      return <pre className="red">{this.state.error.toString()}</pre>;
    }

    return this.props.children;
  }
}

const Overlay = ({ children, onClick }) => (
  <div
    className="absolute absolute--fill bg-black-20"
    onClick={e => {
      if (onClick) {
        onClick(e);
      }
    }}
  >
    <div
      className="absolute"
      style={{
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)"
      }}
    >
      {children}
    </div>
  </div>
);

class App extends Component {
  state = {
    // main storage
    docs: {},
    contents: {},

    // widgets store
    widgetSources: WIDGETS,
    widgetInstances: {},

    // ephemeral stuff
    dragAdjust: [0, 0],
    widgetDropPosition: [0, 0],

    isWidgetChooserVisible: false,
    isWidgetNameInputVisible: false,
    editingWidgetCodeName: undefined,
    tempWidgetName: "",

    draggedPillContentId: undefined,
    draggedPillDocId: undefined
  };

  componentDidMount() {
    const compiledWidgets = Object.entries(WIDGETS).reduce(
      (memo, [key, code]) => ({ ...memo, [key]: compileWidget(code) }),
      {}
    );

    this.setState({
      widgetInstances: compiledWidgets
    });

    this.debouncedCompile = debounce(widgetName => {
      this.setState(
        produce(draft => {
          draft.widgetInstances[widgetName] = compileWidget(
            draft.widgetSources[widgetName]
          );
        })
      );
    }, 1000);
  }

  handleKeyEvent = (key, e) => {
    // edit code
    if (key === "ctrl+e") {
      const selectedDoc = Object.values(this.state.docs).find(
        d => d.isSelected
      );

      if (!selectedDoc) {
        this.setState({ editingWidgetCodeName: undefined });
        return;
      }

      this.setState({ editingWidgetCodeName: selectedDoc.widget });

      return;
    }

    // delete doc
    if (key === "ctrl+backspace" || key === "ctrl+delete" || key === "ctrl+d") {
      const selectedDoc = Object.values(this.state.docs).find(
        d => d.isSelected
      );

      if (!selectedDoc) {
        return;
      }

      this.setState(
        produce(draft => {
          const { contentId } = selectedDoc;

          delete draft.docs[selectedDoc.id];

          const isContentStillUsed = Object.values(draft.docs).some(
            d => d.contentId === contentId
          );

          if (!isContentStillUsed) {
            delete draft.contents[contentId];
          }
        })
      );

      return;
    }
  };

  handleDoubleClick = e => {
    const [x, y] = [e.pageX, e.pageY];

    this.setState({
      widgetDropPosition: [x, y],
      isWidgetChooserVisible: true
    });
  };

  handleClickOutside = () => {
    this.setState(
      produce(draft => {
        Object.values(draft.docs).forEach(d => {
          d.isSelected = false;
        });
      })
    );
  };

  handleDocClick = (doc, e) => {
    e.stopPropagation();

    this.setState(
      produce(draft => {
        Object.values(draft.docs).forEach(d => {
          d.isSelected = d.id === doc.id;

          if (d.id === doc.id && !!draft.editingWidgetCodeName) {
            draft.editingWidgetCodeName = doc.widget;
          }
        });
      })
    );
  };

  handleDocDragStart = (doc, e) => {
    const [x, y] = [e.pageX, e.pageY];
    const [wx, wy] = doc.rect;

    this.setState(
      produce(draft => {
        Object.values(draft.docs).forEach(d => {
          d.isSelected = d.id === doc.id;

          if (d.id === doc.id && !!draft.editingWidgetCodeName) {
            draft.editingWidgetCodeName = doc.widget;
          }
        });

        draft.dragAdjust = [x - wx, y - wy];
      })
    );
  };

  handleDocDrag = (doc, e) => {
    const [x, y] = [e.pageX, e.pageY];

    if (x === 0 && y === 0) {
      // we get 0, 0 at the end of the drag, this could be improved though
      return;
    }

    this.setState(
      produce(draft => {
        draft.docs[doc.id].rect[0] = x - draft.dragAdjust[0];
        draft.docs[doc.id].rect[1] = y - draft.dragAdjust[1];
      })
    );
  };

  handleDocDragEnd = (_, e) => {
    this.setState(
      produce(draft => {
        draft.dragAdjust = [0, 0];
      })
    );
  };

  handleDocDoubleClick = (doc, e) => {
    e.stopPropagation();
  };

  handleDocResizeDragStart = (doc, e) => {
    e.stopPropagation();

    const [x, y] = [e.pageX, e.pageY];
    const [ww, wh] = doc.rect.slice(2);

    this.setState(
      produce(draft => {
        Object.values(draft.docs).forEach(d => {
          d.isSelected = d.id === doc.id;

          if (d.id === doc.id && !!draft.editingWidgetCodeName) {
            draft.editingWidgetCodeName = doc.widget;
          }
        });

        draft.dragAdjust = [x - ww, y - wh];
      })
    );
  };

  handleDocResizeDrag = (doc, e) => {
    e.stopPropagation();

    const [x, y] = [e.pageX, e.pageY];

    if (x === 0 && y === 0) {
      // we get 0, 0 at the end of the drag, this could be improved though
      return;
    }

    this.setState(
      produce(draft => {
        draft.docs[doc.id].rect[2] = Math.max(200, x - draft.dragAdjust[0]);
        draft.docs[doc.id].rect[3] = Math.max(100, y - draft.dragAdjust[1]);
      })
    );
  };

  handleDocResizeDragEnd = (_, e) => {
    e.stopPropagation();

    this.setState(
      produce(draft => {
        draft.dragAdjust = [0, 0];
      })
    );
  };

  handleDocContentChange = (doc, callback) => {
    this.setState(
      produce(draft => {
        draft.contents[doc.contentId].content = callback(
          draft.contents[doc.contentId].content
        );
      })
    );
  };

  handleWidgetCreation = widgetName => {
    if (!widgetName) {
      this.setState({
        isWidgetNameInputVisible: true,
        isWidgetChooserVisible: false
      });
    } else {
      this.setState(
        produce(draft => {
          if (!draft.widgetSources[widgetName]) {
            // we don't have a source for this widget, so we need to make a new one
            draft.widgetSources[widgetName] = EMPTY_WIDGET;
            draft.widgetInstances[widgetName] = compileWidget(EMPTY_WIDGET);
          }

          const [x, y] = draft.widgetDropPosition;

          const { doc, content } = createDocWithContent({
            x,
            y,
            widget: widgetName
          });

          draft.docs[doc.id] = doc;
          draft.contents[content.id] = content;

          draft.isWidgetChooserVisible = false;
          draft.isWidgetNameInputVisible = false;
          draft.tempWidgetName = "";
        })
      );
    }
  };

  handlePillDragStart = (doc, e) => {
    e.stopPropagation();

    this.setState({
      draggedPillContentId: doc.contentId,
      draggedPillDocId: doc.id
    });
  };

  handlePillDragEnd = (doc, e) => {
    e.stopPropagation();

    this.setState({
      draggedPillContentId: undefined,
      draggedPillDocId: undefined
    });
  };

  handleDropPill = (doc, e) => {
    this.setState(
      produce(draft => {
        draft.docs[doc.id].expectedContentId = draft.draggedPillContentId;
      })
    );
  };

  handleWidgetCodeChange = (widgetName, value) => {
    this.setState(
      produce(draft => {
        draft.widgetSources[widgetName] = value;
      })
    );

    this.debouncedCompile(widgetName);
  };

  render() {
    const {
      isWidgetChooserVisible,
      isWidgetNameInputVisible,
      editingWidgetCodeName
    } = this.state;

    const editingCode = editingWidgetCodeName
      ? this.state.widgetSources[editingWidgetCodeName]
      : "";

    const docGroups = Object.values(this.state.docs)
      .reduce((memo, { contentId, expectedContentId }) => {
        if (!expectedContentId) {
          return memo;
        }

        const matching = memo.find(
          s => s.has(expectedContentId) || s.has(contentId)
        );

        if (matching) {
          matching.add(contentId);
          matching.add(expectedContentId);

          return memo;
        }

        memo.push(new Set([expectedContentId, contentId]));

        return memo;
      }, [])
      .map(s =>
        [...s]
          .map(id =>
            Object.values(this.state.docs).find(
              ({ contentId }) => contentId === id
            )
          )
          .filter(_ => !!_)
          .map(({ id }) => id)
      );

    const docToGroupIdx = docGroups.reduce((memo, docIds, idx) => {
      docIds.forEach(docId => (memo[docId] = idx));
      return memo;
    }, {});

    return (
      <div className="min-vh-100 sans-serif flex">
        <KeyboardEventHandler
          handleKeys={["ctrl+e", "ctrl+d"]}
          onKeyEvent={this.handleKeyEvent}
        />

        <div
          onDoubleClick={this.handleDoubleClick}
          onClick={this.handleClickOutside}
          className="w-100 relative"
        >
          {Object.values(this.state.docs).map(doc => {
            const [x, y, w, h] = doc.rect;

            const docDragProps = {
              draggable: true,
              onDragStart: e => this.handleDocDragStart(doc, e),
              onDrag: e => this.handleDocDrag(doc, e),
              onDragEnd: e => this.handleDocDragEnd(doc, e)
            };

            const resizeDocDragProps = {
              draggable: true,
              onDragStart: e => this.handleDocResizeDragStart(doc, e),
              onDrag: e => this.handleDocResizeDrag(doc, e),
              onDragEnd: e => this.handleDocResizeDragEnd(doc, e)
            };

            const pillExposesDragProps = {
              draggable: true,
              onDragStart: e => this.handlePillDragStart(doc, e),
              onDrag: e => e.stopPropagation(),
              onDragEnd: e => this.handlePillDragEnd(doc, e)
            };

            const groupIdx = docToGroupIdx[doc.id];

            const color =
              groupIdx !== undefined && COLORS[groupIdx]
                ? `${COLORS[groupIdx]}`
                : "light-gray";

            const border = doc.isSelected ? "b--blue" : `b--${color}`;

            const background = doc.isSelected ? "bg-blue" : "bg-light-gray";

            const types = this.state.widgetInstances[doc.widget].types || {
              expects: undefined,
              exposes: undefined
            };

            const draggedDocId = this.state.draggedPillDocId;
            const draggedExposedType = !!this.state.draggedPillDocId
              ? this.state.widgetInstances[
                  this.state.docs[this.state.draggedPillDocId].widget
                ].types.exposes
              : undefined;

            return (
              <div
                key={doc.id}
                className={`absolute ba bw1 ${border} flex flex-column bg-white`}
                style={{
                  top: y,
                  left: x,
                  width: w,
                  height: h
                }}
                onClick={e => this.handleDocClick(doc, e)}
                {...docDragProps}
              >
                {types.expects && (
                  <div>
                    <div className="bg-light-gray pa2 f6">
                      <span>
                        {!!this.state.contents[doc.expectedContentId]
                          ? "Uses"
                          : "Expects"}
                      </span>

                      <span
                        className={`
                          ml2 pa1 br2
                          ${
                            draggedExposedType === types.expects
                              ? "bg-light-blue white"
                              : !!this.state.contents[doc.expectedContentId]
                                ? `bg-${color} white`
                                : "bg-white gray"
                          }
                        `}
                        {...draggedExposedType === types.expects &&
                          draggedDocId !== doc.id && {
                            onDragOver: e => {
                              e.stopPropagation();
                              e.preventDefault();
                            },
                            onDrop: e => this.handleDropPill(doc, e)
                          }}
                      >
                        {types.expects}
                      </span>
                    </div>
                  </div>
                )}

                <div className="overflow-scroll h-100 m0 pa2">
                  <TryCatch key={this.state.widgetInstances[doc.widget].hash}>
                    {React.createElement(
                      this.state.widgetInstances[doc.widget],
                      {
                        doc: this.state.contents[doc.contentId].content,
                        expectedDoc: get(
                          this.state.contents,
                          [doc.expectedContentId, "content", "exposes"],
                          undefined
                        ),
                        change: callback =>
                          this.handleDocContentChange(doc, callback)
                      }
                    )}
                  </TryCatch>
                </div>

                {types.exposes && (
                  <div className="bg-light-gray pa2 f6">
                    Exposes
                    <span
                      className="ml2 pa1 br2 bg-gray white"
                      {...{ "data-doc-id": doc.id }}
                      {...pillExposesDragProps}
                    >
                      {types.exposes}
                    </span>
                  </div>
                )}

                <div
                  className={`absolute right-0 bottom-0 ${background}`}
                  style={{ width: 12, height: 12 }}
                  {...resizeDocDragProps}
                />
              </div>
            );
          })}

          {isWidgetChooserVisible && (
            <Overlay
              onClick={() => this.setState({ isWidgetChooserVisible: false })}
            >
              <div className="list pl0 ml0 center mw5 ba b--light-silver br3 bg-white">
                {Object.keys(this.state.widgetSources).map(name => (
                  <div
                    key={name}
                    className="ph3 pv2 bb b--light-silver"
                    onClick={e => this.handleWidgetCreation(name)}
                  >
                    {name}
                  </div>
                ))}
              </div>

              <div className="list pl0 ml0 center mw5 ba b--light-silver br3 bg-white mt2">
                <div
                  className="ph3 pv2 bb b--light-silver"
                  onClick={e => this.handleWidgetCreation()}
                >
                  Create New...
                </div>
              </div>
            </Overlay>
          )}

          {isWidgetNameInputVisible && (
            <Overlay
              onClick={() => this.setState({ isWidgetNameInputVisible: false })}
            >
              <div className="list pl0 ml0 center mw5 ba b--light-silver br3 bg-white">
                <input
                  className="ph3 pv2 b0"
                  placeholder="My Widget"
                  value={this.state.tempWidgetName}
                  onClick={e => e.stopPropagation()}
                  onChange={e =>
                    this.setState({ tempWidgetName: e.target.value })
                  }
                />
                <div
                  className="ph3 pv2 bb b--light-silver"
                  onClick={e =>
                    this.handleWidgetCreation(this.state.tempWidgetName)
                  }
                >
                  Create
                </div>
              </div>
            </Overlay>
          )}
        </div>

        {!!editingWidgetCodeName && (
          <div className="w-100 ba b--light-gray bg-white z-1">
            <AceEditor
              mode="jsx"
              theme="xcode"
              value={editingCode}
              tabSize={2}
              height="100%"
              width="100%"
              onChange={value => {
                this.handleWidgetCodeChange(editingWidgetCodeName, value);
              }}
            />
          </div>
        )}
      </div>
    );
  }
}

export default App;
