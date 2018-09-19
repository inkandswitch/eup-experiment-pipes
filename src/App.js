import produce from "immer";
import uuid from "uuid/v4";
import React, { Component } from "react";

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
    return <pre style={{ color: "red" }}>{transformationError.toString()}</pre>;
  }

  let evaled, evalError;

  try {
    evaled = eval(transformed.code);
  } catch (e) {
    evalError = e;
  }

  if (evalError) {
    return <pre style={{ color: "red" }}>{evalError.toString()}</pre>;
  }

  let run, runError;

  try {
    run = evaled();
  } catch (e) {
    runError = e;
  }

  if (runError) {
    return <pre style={{ color: "red" }}>{runError.toString()}</pre>;
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
        widget.compiled = compileWidget(widget);
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

  handleWidgetTextChange = (widget, e) => {
    const { value } = e.target;

    this.setState(
      produce(draft => {
        draft.widgets[widget.id].code = value;
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
    return (
      <div
        onDoubleClick={this.handleDoubleClick}
        onClick={this.handleClickOutside}
        style={{ height: "100vh", width: "100vh" }}
      >
        {Object.values(this.state.widgets).map(widget => {
          const [x, y, w, h] = widget.rect;

          const widgetDragProps = widget.isEditing
            ? {}
            : {
                draggable: true,
                onDragStart: e => this.handleWidgetDragStart(widget, e),
                onDrag: e => this.handleWidgetDrag(widget, e),
                onDragEnd: e => this.handleWidgetDragEnd(widget, e)
              };

          const resizeWidgetDragProps = widget.isEditing
            ? {}
            : {
                draggable: true,
                onDragStart: e => this.handleWidgetResizeDragStart(widget, e),
                onDrag: e => this.handleWidgetResizeDrag(widget, e),
                onDragEnd: e => this.handleWidgetResizeDragEnd(widget, e)
              };

          return (
            <div
              key={widget.id}
              style={{
                position: "absolute",
                border: !widget.isEditing ? "1px solid #eee" : "1px solid red",
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
              {widget.isEditing ? (
                <textarea
                  style={{
                    fontFamily: "monospace",
                    width: "100%",
                    height: "100%",
                    padding: 0,
                    border: 0,
                    fontSize: 14
                  }}
                  value={widget.code}
                  onChange={e => this.handleWidgetTextChange(widget, e)}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <div
                  style={{
                    fontFamily: "sans-serif",
                    overflow: "scroll",
                    width: "100%",
                    height: "100%",
                    margin: 0,
                    fontSize: 14
                  }}
                >
                  {widget.compiled}
                </div>
              )}

              <div
                style={{
                  background: "#eee",
                  width: 8,
                  height: 8,
                  position: "absolute",
                  bottom: 0,
                  right: 0
                }}
                {...resizeWidgetDragProps}
              />
            </div>
          );
        })}
      </div>
    );
  }
}

export default App;
