import produce from "immer";
import uuid from "uuid/v4";
import React, { Component } from "react";
import AceEditor from "react-ace";

import "brace/mode/javascript";
import "brace/mode/jsx";
import "brace/theme/xcode";

const babel = require("@babel/standalone");

// HACK: save react as window global so we can eval babel
window.React = React;

// FIXME: try-catches here are probably overkill, we can clean this up later
const compileDoc = code => {
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
    return <pre className="red">{transformationError.toString()}</pre>;
  }

  let evaled, evalError;

  try {
    evaled = eval(transformed.code);
  } catch (e) {
    evalError = e;
  }

  if (evalError) {
    return <pre className="red">{evalError.toString()}</pre>;
  }

  let run, runError;

  // try {
  //   run = evaled();
  // } catch (e) {
  //   runError = e;
  // }

  // if (runError) {
  //   return <pre className="red">{runError.toString()}</pre>;
  // }

  // console.log({ run })

  return evaled;
};

// const createDoc = ({ x, y, w = 200, h = 40 }) => {
//   const metadata = {
//     rect: [x, y, w, h],
//     id: uuid(),
//     isEditing: false,
//     code: `return () => <div>widget</div>`
//   };

//   return { ...metadata, compiled: compileDoc(metadata) };
// };

const WIDGETS = {
  RAW: `
    return ({ doc }) => (
      <pre>{doc}</pre>
    );
  `,

  RAW_EDIT: `
    return ({ doc, change }) => (
      <textarea
        className="m0 b0 w-100 h-100"
        onChange={e => change(e.target.value)}
      >
        {doc}
      </textarea>
    )
  `
};

const createDocWithContent = ({ x, y, w = 200, h = 40, content = "" }) => {
  const contentId = uuid();

  return {
    doc: {
      // display props
      id: uuid(),
      rect: [x, y, w, h],
      isSelected: true,

      // content id
      contentId,

      // display
      widget: compileDoc(WIDGETS.RAW_EDIT)
    },
    content: {
      id: contentId,
      content
    }
  };
};

class App extends Component {
  state = {
    docs: {},
    contents: {},
    dragAdjust: [0, 0]
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
        draft.contents[doc.contentId] = content;
      })
    );
  };

  render() {
    const isEditingCode = false;

    return (
      <div className="min-vh-100 sans-serif flex">
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
