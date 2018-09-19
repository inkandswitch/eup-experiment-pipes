import produce from "immer";
import uuid from "uuid/v4";
import React, { Component } from "react";

const createWidget = ({ x, y, w = 200, h = 40 }) => ({
  rect: [x, y, w, h],
  id: uuid(),
  isEditing: false,
  text: "widget text"
});

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
        Object.values(draft.widgets).forEach(
          widget => (widget.isEditing = false)
        );
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
        draft.widgets[widget.id].text = value;
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
                    fontFamily: "sans-serif",
                    width: "100%",
                    height: "100%",
                    padding: 0,
                    border: 0,
                    fontSize: 14
                  }}
                  value={widget.text}
                  onChange={e => this.handleWidgetTextChange(widget, e)}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <pre
                  style={{
                    fontFamily: "sans-serif",
                    overflow: "scroll",
                    width: "100%",
                    height: "100%",
                    margin: 0,
                    fontSize: 14
                  }}
                >
                  {widget.text}
                </pre>
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
