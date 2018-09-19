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

  componentDidMount() {}

  componentWillUmount() {}

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

  render() {
    return (
      <div
        onDoubleClick={this.handleDoubleClick}
        onClick={this.handleClickOutside}
        style={{ height: "100vh", width: "100vh" }}
      >
        {Object.values(this.state.widgets).map(widget => {
          const [x, y, w, h] = widget.rect;

          const dragProps = widget.isEditing
            ? {}
            : {
                draggable: true,
                onDoubleClick: e => this.handleWidgetDoubleClick(widget, e),
                onDragStart: e => this.handleWidgetDragStart(widget, e),
                onDrag: e => this.handleWidgetDrag(widget, e),
                onDragEnd: e => this.handleWidgetDragEnd(widget, e)
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
              {...dragProps}
            >
              {widget.isEditing ? (
                <textarea
                  style={{
                    width: "100%",
                    height: "100%",
                    padding: 0,
                    border: 0
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
                    margin: 0
                  }}
                >
                  {widget.text}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    );
  }
}

export default App;
