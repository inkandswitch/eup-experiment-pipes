import produce from "immer";
import uuid from "uuid/v4";
import React, { Component } from "react";
import AceEditor from "react-ace";
import KeyboardEventHandler from "react-keyboard-event-handler";

import "brace/mode/javascript";
import "brace/mode/jsx";
import "brace/theme/xcode";

const babel = require("@babel/standalone");

// HACK: save react as window global so we can eval babel
window.React = React;

// FIXME: try-catches here are probably overkill, we can clean this up later
const compileWidget = code => {
  let transformed, transformationError;

  try {
    transformed = babel.transform(
      `
        (function() {
          ${code}
        })()
      `,
      {
        presets: ["es2015", "react"]
      }
    );
  } catch (e) {
    transformationError = e;
  }

  if (transformationError) {
    return () => <pre className="red">{transformationError.toString()}</pre>;
  }

  let evaled, evalError;

  try {
    evaled = eval(transformed.code);
  } catch (e) {
    evalError = e;
  }

  if (evalError) {
    return () => <pre className="red">{evalError.toString()}</pre>;
  }

  return evaled;
};

const WIDGETS = {
  ["basic preview"]: `
    return ({ doc }) => (
      <pre>{doc}</pre>
    );
  `,

  ["edit as raw text"]: `
    return ({ doc, change }) => (
      <textarea
        className="m0 bw0 w-100 h-100"
        onChange={e => change(e.target.value)}
        value={doc || ""}
      />
    )
  `,

  ["just a list"]: `
    return ({ doc, change }) => {
      const listItems = doc
        .split("\\n")
        .filter(line => line.trim().startsWith("-"))
        .map(line => line.replace("- ", ""));

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
  `
};

const createDocWithContent = ({
  x,
  y,
  w = 200,
  h = 40,
  content = "",
  contentId
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

      // display
      widget: compileWidget(WIDGETS["basic preview"])
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

    // ephemeral stuff
    copiedDocId: undefined,
    dragAdjust: [0, 0],
    isWidgetChooserVisible: false,
    isEditingWidgetCode: false
  };

  componentDidMount() {
    const { doc, content } = createDocWithContent({
      x: 100,
      y: 100,
      w: 640,
      h: 200,
      content: ` Hi!

 - doubleclick to create new doc
 - ctrl+w to switch widget type
   - switch to "edit as raw text" to change the content
   - widgets with the same doc (copied) will update their content
 - ctrl+c to copy doc
 - ctrl+v to paste doc
 - ctrl+d to delete selected doc`
    });

    this.setState({
      docs: { [doc.id]: doc },
      contents: { [content.id]: content }
    });
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

    this.setState(
      produce(draft => {
        const { doc, content } = createDocWithContent({ x, y });
        draft.docs[doc.id] = doc;
        draft.contents[content.id] = content;
      })
    );
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

  handleDocContentChange = (doc, content) => {
    this.setState(
      produce(draft => {
        draft.contents[doc.contentId].content = content;
      })
    );
  };

  handleDocWidgetChange = widgetName => {
    // chooser can't be visible without selected doc
    const selectedDoc = Object.values(this.state.docs).find(d => d.isSelected);

    this.setState(
      produce(draft => {
        draft.docs[selectedDoc.id].widget = compileWidget(WIDGETS[widgetName]);
        draft.isWidgetChooserVisible = false;
      })
    );
  };

  render() {
    const { isWidgetChooserVisible, isEditingWidgetCode } = this.state;

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

            return (
              <div
                key={doc.id}
                className={`
                  absolute ba
                  ${doc.isSelected ? "b--red" : "b--light-gray"}
                `}
                style={{
                  top: y,
                  left: x,
                  width: w,
                  height: h
                }}
                onClick={e => this.handleDocClick(doc, e)}
                {...docDragProps}
              >
                <div className="overflow-scroll mw-100 h-100 m0">
                  {doc.widget({
                    doc: this.state.contents[doc.contentId].content,
                    change: content => this.handleDocContentChange(doc, content)
                  })}
                </div>

                <div
                  className={`
                    absolute right-0 bottom-0
                    ${doc.isSelected ? "bg-red" : "bg-light-gray"}
                  `}
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
                {Object.keys(WIDGETS).map(name => (
                  <div
                    key={name}
                    className="ph3 pv2 bb b--light-silver"
                    onClick={e => this.handleDocWidgetChange(name)}
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
