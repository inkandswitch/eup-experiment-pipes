import produce from "immer";
import uuid from "uuid/v4";
import React, { Component } from "react";
import AceEditor from "react-ace";
import KeyboardEventHandler from "react-keyboard-event-handler";
import deepEqual from "deep-equal";

import "brace/mode/javascript";
import "brace/mode/jsx";
import "brace/theme/xcode";

const babel = require("@babel/standalone");

// HACK: save react as window global so we can eval babel
window.React = React;

// FIXME: try-catches here are probably overkill, we can clean this up later
const compileWidget = code => {
  let transformed, transformatihandleError;

  try {
    transformed = babel.transform(code, {
      presets: ["es2015", "react"]
    });
  } catch (e) {
    transformatihandleError = e;
  }

  if (transformatihandleError) {
    console.error(transformatihandleError);
    return () => <pre className="red">{transformatihandleError.toString()}</pre>;
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

  return;
};

class Widget extends React.Component {
  change(cb) {
    this.props.change(cb);
  }

  componentDidUpdate(prevProps) {
    if (
      this.handleExpectedDocChange &&
      this.props.expectedDoc &&
      !deepEqual(this.props.expectedDoc, prevProps.expectedDoc)
    ) {
      this.handleExpectedDocChange(this.props.expectedDoc);
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

const WIDGETS = {
  ["Editable Note"]: `
    const EditableNoteTypes = {
      expects: undefined,
      exposes: "Text"
    };

    class EditableNote extends Widget {
      show(doc) {
        return (
          <textarea
            className="m0 bw1 w-100 h-100 b--light-gray"
            value={doc}
            onChange={e => {
              const { value } = e.target;

              this.change(doc => (doc = value));
            }}
          />
        );
      }
    }

    Widgets.register("Editable Note", EditableNote, EditableNoteTypes);
  `,

  ["Text To List"]: `
    const TextToListTypes = {
      expects: "Text",
      exposes: "List"
    };

    class TextToList extends Widget {
      handleExpectedDocChange(expectedDoc) {
        const newDoc = (expectedDoc || "")
          .split("\\n")
          .filter(line => line.trim().startsWith("-"))
          .map(line => line.replace("- ", ""));

        this.change(draft => (draft = newDoc));
      }

      show() {
        return <div>transforms text to list</div>;
      }
    }

    Widgets.register("Text To List", TextToList, TextToListTypes);
  `,

  ["Pretty List"]: `
    const PrettyListTypes = {
      expects: "List",
      exposes: undefined
    };

    class PrettyList extends Widget {
      show(_, doc) {
        const listItems = doc || [];

        return (
          <div>
            <ul>
              {listItems.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <div>Number of items on your list: {listItems.length}</div>
          </div>
        );
      }
    }

    Widgets.register("Pretty List", PrettyList, PrettyListTypes);
  `
};

const createDocWithContent = ({
  x,
  y,
  w = 300,
  h = 200,
  content = "",
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

class App extends Component {
  state = {
    // main storage
    docs: {},
    contents: {},

    // widgets store
    widgetSources: WIDGETS,
    widgetInstances: {},
    widgetTypes: {},

    // ephemeral stuff
    copiedDocId: undefined,
    dragAdjust: [0, 0],
    widgetDropPosition: [0, 0],
    isWidgetChooserVisible: false,
    isEditingWidgetCode: false
  };

  componentDidMount() {
    window.Widgets = {
      register: (name, code, types) => {
        this.setState(
          produce(draft => {
            draft.widgetInstances[name] = code;
            draft.widgetTypes[name] = types;
          })
        );
      }
    };

    Object.values(WIDGETS).forEach(code => compileWidget(code));

    setTimeout(() => {
      console.log(this.state);
    }, 1000);
  }

  handleKeyEvent = (key, e) => {
    // copy doc
    if (key === "ctrl+c") {
      const selectedDoc = Object.values(this.state.docs).find(
        d => d.isSelected
      );

      if (!selectedDoc) {
        return;
      }

      this.setState({ copiedDocId: selectedDoc.id });

      return;
    }

    // paste doc
    if (key === "ctrl+v") {
      if (!this.state.copiedDocId) {
        return;
      }

      this.setState(
        produce(draft => {
          const copiedDoc = draft.docs[draft.copiedDocId];

          const { doc } = createDocWithContent({
            x: copiedDoc.rect[0] + 100,
            y: copiedDoc.rect[1] + 100,
            contentId: copiedDoc.contentId
          });

          draft.docs[doc.id] = doc;

          Object.values(draft.docs).forEach(
            d => (d.isSelected = d.id === doc.id)
          );
        })
      );

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

    // swap widget on doc
    if (key === "ctrl+w") {
      const selectedDoc = Object.values(this.state.docs).find(
        d => d.isSelected
      );

      if (!selectedDoc) {
        return;
      }

      this.setState({ isWidgetChooserVisible: true });

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
        Object.values(draft.docs).forEach(d => (d.isSelected = false));
      })
    );
  };

  handleDocClick = (doc, e) => {
    e.stopPropagation();

    this.setState(
      produce(draft => {
        Object.values(draft.docs).forEach(d => {
          d.isSelected = d.id === doc.id;
        });
      })
    );
  };

  handleDocDragStart = (doc, e) => {
    const [x, y] = [e.pageX, e.pageY];
    const [wx, wy] = doc.rect;

    this.setState(
      produce(draft => {
        Object.values(draft.docs).forEach(
          d => (d.isSelected = d.id === doc.id)
        );
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
        Object.values(draft.docs).forEach(
          d => (d.isSelected = d.id === doc.id)
        );
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
        draft.docs[doc.id].rect[2] = x - draft.dragAdjust[0];
        draft.docs[doc.id].rect[3] = y - draft.dragAdjust[1];
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
    this.setState(
      produce(draft => {
        const [x, y] = draft.widgetDropPosition;

        const { doc, content } = createDocWithContent({
          x,
          y,
          widget: widgetName
        });

        draft.docs[doc.id] = doc;
        draft.contents[content.id] = content;

        draft.isWidgetChooserVisible = false;
      })
    );
  };

  handlePillDragStart = (doc, e) => {
    e.stopPropagation();

    this.setState({ draggedPillContentId: doc.contentId });
  };

  handleDropPill = (doc, e) => {
    this.setState(
      produce(draft => {
        draft.docs[doc.id].expectedContentId = draft.draggedPillContentId;
        draft.draggedPillSourceId = undefined;
      })
    );
  };

  render() {
    const { isWidgetChooserVisible, isEditingWidgetCode } = this.state;

    console.log(this.state);

    return (
      <div className="min-vh-100 sans-serif flex">
        <KeyboardEventHandler
          handleKeys={[
            "ctrl+c",
            "ctrl+v",
            "ctrl+w",
            "ctrl+d",
            "ctrl+delete",
            "ctrl+backspace"
          ]}
          onKeyEvent={this.handleKeyEvent}
        />

        <div
          onDoubleClick={this.handleDoubleClick}
          onClick={this.handleClickOutside}
          className="w-100"
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
              onDragEnd: e => e.stopPropagation()
            };

            const border = doc.isSelected ? "b--red" : "b--light-gray";
            const background = doc.isSelected ? "bg-red" : "bg-light-gray";

            return (
              <div
                key={doc.id}
                className={`absolute ba ${border} flex flex-column`}
                style={{
                  top: y,
                  left: x,
                  width: w,
                  height: h
                }}
                onClick={e => this.handleDocClick(doc, e)}
                {...docDragProps}
              >
                {this.state.widgetTypes[doc.widget].expects && (
                  <div>
                    <div className="bg-light-gray pa2 f6">
                      <span>
                        {!!this.state.contents[doc.expectedContentId]
                          ? "Uses"
                          : "Expects"}
                      </span>

                      <span
                        className="ml2 pa1 br2 bg-white gray"
                        onDragOver={e => {
                          // TODO: highlight if matches
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        onDrop={e => this.handleDropPill(doc, e)}
                      >
                        {this.state.widgetTypes[doc.widget].expects}
                      </span>
                    </div>
                  </div>
                )}

                <div className="overflow-scroll h-100 m0 pa2">
                  {React.createElement(this.state.widgetInstances[doc.widget], {
                    doc: this.state.contents[doc.contentId].content,
                    expectedDoc: this.state.contents[doc.expectedContentId]
                      ? this.state.contents[doc.expectedContentId].content
                      : undefined,
                    change: callback =>
                      this.handleDocContentChange(doc, callback)
                  })}
                </div>

                {this.state.widgetTypes[doc.widget].exposes && (
                  <div className="bg-light-gray pa2 f6">
                    Exposes
                    <span
                      className="ml2 pa1 br2 bg-gray white"
                      {...{ ["data-doc-id"]: doc.id }}
                      {...pillExposesDragProps}
                    >
                      {this.state.widgetTypes[doc.widget].exposes}
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
        </div>

        {isWidgetChooserVisible && (
          <div className="absolute absolute--fill bg-black-20">
            <div
              className="absolute"
              style={{
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)"
              }}
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
            </div>
          </div>
        )}

        {/* {isEditingCode && ( */}
        {/*   <div className="w-100 ba b--light-gray"> */}
        {/*     <AceEditor */}
        {/*       mode="jsx" */}
        {/*       theme="xcode" */}
        {/*       value={editingDoc.code} */}
        {/*       tabSize={2} */}
        {/*       onChange={value => */}
        {/*         this.handleDocCodeChange(editingDoc, value) */}
        {/*       } */}
        {/*     /> */}
        {/*   </div> */}
        {/* )} */}
      </div>
    );
  }
}

export default App;
