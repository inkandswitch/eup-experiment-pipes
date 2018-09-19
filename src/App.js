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
const compileWidget = ({ code }) => {
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

  try {
    run = evaled();
  } catch (e) {
    runError = e;
  }

  if (runError) {
    return <pre className="red">{runError.toString()}</pre>;
  }

  return run;
};

const createWidget = ({ x, y, w = 200, h = 40 }) => {
  const metadata = {
    rect: [x, y, w, h],
    id: uuid(),
    isEditing: false,
    code: `return () => <div>widget</div>`
  };

  return { ...metadata, compiled: compileWidget(metadata) };
};

class App extends Component {
  state = {
    widgets: {},
    dragAdjust: [0, 0]
  };

  handleDoubleClick = e => {
    const anyEditing = Object.values(this.state.widgets).some(
      widget => widget.isEditing
    );

    if (anyEditing) {
      // if we have anything being edited, then double clicks are probably to select text
      return;
    }

    const [x, y] = [e.pageX, e.pageY];

    this.setState(
      produce(draft => {
        const widget = createWidget({ x, y });

        draft.widgets[widget.id] = widget;
      })
    );
  };

  handleClickOutside = () => {
    this.setState(
      produce(draft => {
        const widget = Object.values(draft.widgets).find(
          widget => widget.isEditing
        );

        if (!widget) {
          return;
        }

        widget.isEditing = false;
      })
    );
  };

  handleWidgetDragStart = (widget, e) => {
    const [x, y] = [e.pageX, e.pageY];
    const [wx, wy] = widget.rect;

    this.setState(
      produce(draft => {
        draft.dragAdjust = [x - wx, y - wy];
      })
    );
  };

  handleWidgetDrag = (widget, e) => {
    const [x, y] = [e.pageX, e.pageY];

    if (x === 0 && y === 0) {
      // we get 0, 0 at the end of the drag, this could be improved though
      return;
    }

    this.setState(
      produce(draft => {
        draft.widgets[widget.id].rect[0] = x - draft.dragAdjust[0];
        draft.widgets[widget.id].rect[1] = y - draft.dragAdjust[1];
      })
    );
  };

  handleWidgetDragEnd = (widget, e) => {
    this.setState(
      produce(draft => {
        draft.dragAdjust = [0, 0];
      })
    );
  };

  handleWidgetDoubleClick = (widget, e) => {
    e.stopPropagation();

    this.setState(
      produce(draft => {
        draft.widgets[widget.id].isEditing = !draft.widgets[widget.id]
          .isEditing;
      })
    );
  };

  handleWidgetCodeChange = ({ id }, value) => {
    this.setState(
      produce(draft => {
        const widget = draft.widgets[id];

        widget.code = value;
        widget.compiled = compileWidget(widget);
      })
    );
  };

  handleWidgetResizeDragStart = (widget, e) => {
    e.stopPropagation();

    const [x, y] = [e.pageX, e.pageY];
    const [ww, wh] = widget.rect.slice(2);

    this.setState(
      produce(draft => {
        draft.dragAdjust = [x - ww, y - wh];
      })
    );
  };

  handleWidgetResizeDrag = (widget, e) => {
    e.stopPropagation();

    const [x, y] = [e.pageX, e.pageY];

    if (x === 0 && y === 0) {
      // we get 0, 0 at the end of the drag, this could be improved though
      return;
    }

    this.setState(
      produce(draft => {
        draft.widgets[widget.id].rect[2] = x - draft.dragAdjust[0];
        draft.widgets[widget.id].rect[3] = y - draft.dragAdjust[1];
      })
    );
  };

  handleWidgetResizeDragEnd = (widget, e) => {
    e.stopPropagation();

    this.setState(
      produce(draft => {
        draft.dragAdjust = [0, 0];
      })
    );
  };

  render() {
    const editingWidget = Object.values(this.state.widgets).find(
      widget => widget.isEditing
    );

    const anyEditing = !!editingWidget;

    return (
      <div className="min-vh-100 sans-serif flex">
        <div
          onDoubleClick={this.handleDoubleClick}
          onClick={this.handleClickOutside}
          className="w-100"
        >
          {Object.values(this.state.widgets).map(widget => {
            const [x, y, w, h] = widget.rect;

            const widgetDragProps = {
              draggable: true,
              onDragStart: e => this.handleWidgetDragStart(widget, e),
              onDrag: e => this.handleWidgetDrag(widget, e),
              onDragEnd: e => this.handleWidgetDragEnd(widget, e)
            };

            const resizeWidgetDragProps = {
              draggable: true,
              onDragStart: e => this.handleWidgetResizeDragStart(widget, e),
              onDrag: e => this.handleWidgetResizeDrag(widget, e),
              onDragEnd: e => this.handleWidgetResizeDragEnd(widget, e)
            };

            return (
              <div
                key={widget.id}
                className={`
                  absolute ba
                  ${widget.isEditing ? "b--red" : "b--light-gray"}
                `}
                style={{
                  top: y,
                  left: x,
                  width: w,
                  height: h
                }}
                onDoubleClick={
                  widget.isEditing
                    ? () => {}
                    : e => this.handleWidgetDoubleClick(widget, e)
                }
                {...widgetDragProps}
              >
                <div className="overflow-scroll mw-100 h-100 m0">
                  {widget.compiled}
                </div>

                <div
                  className={`
                    absolute right-0 bottom-0
                    ${widget.isEditing ? "bg-red" : "bg-light-gray"}
                  `}
                  style={{ width: 12, height: 12 }}
                  {...resizeWidgetDragProps}
                />
              </div>
            );
          })}
        </div>

        {anyEditing && (
          <div className="w-100 ba b--light-gray">
            <AceEditor
              mode="jsx"
              theme="xcode"
              value={editingWidget.code}
              tabSize={2}
              onChange={value =>
                this.handleWidgetCodeChange(editingWidget, value)
              }
            />
          </div>
        )}
      </div>
    );
  }
}

export default App;
