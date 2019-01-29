/// <reference path="utils.ts" />
/// <reference path="constants.ts" />
/// <reference path="cellRenderers/groupCellRendererFactory.ts" />

module awk.grid {

    var utils = Utils;
    var constants = Constants;

    export class RowRenderer {

        gridOptions: any;
        columnModel: any;
        gridOptionsWrapper: any;
        angularGrid: any;
        selectionRendererFactory: any;
        gridPanel: any;
        $compile: any;
        $scope: any;
        selectionController: any;
        expressionService: any;
        templateService: any;
        cellRendererMap: any;
        renderedRows: any;
        renderedRowStartEditingListeners: any;
        editingCell: any;
        rowModel: any;
        eBodyContainer: any;
        eBodyViewport: any;
        ePinnedColsContainer: any;
        eParentOfRows: any;
        firstVirtualRenderedRow: any;
        lastVirtualRenderedRow: any;
        focusedCell: any;

        init(gridOptions: any, columnModel: any, gridOptionsWrapper: any, gridPanel: any,
             angularGrid: any, selectionRendererFactory: any, $compile: any, $scope: any,
             selectionController: any, expressionService: any, templateService: any) {
            this.gridOptions = gridOptions;
            this.columnModel = columnModel;
            this.gridOptionsWrapper = gridOptionsWrapper;
            this.angularGrid = angularGrid;
            this.selectionRendererFactory = selectionRendererFactory;
            this.gridPanel = gridPanel;
            this.$compile = $compile;
            this.$scope = $scope;
            this.selectionController = selectionController;
            this.expressionService = expressionService;
            this.templateService = templateService;
            this.findAllElements(gridPanel);

            this.cellRendererMap = {
                'group': groupCellRendererFactory(gridOptionsWrapper, selectionRendererFactory)
            };

            // map of row ids to row objects. keeps track of which elements
            // are rendered for which rows in the dom. each row object has:
            // [scope, bodyRow, pinnedRow, rowData]
            this.renderedRows = {};

            this.renderedRowStartEditingListeners = {};

            this.editingCell = false; //gets set to true when editing a cell
        }

        setRowModel(rowModel: any) {
            this.rowModel = rowModel;
        }

        setMainRowWidths() {
            var mainRowWidth = this.columnModel.getBodyContainerWidth() + "px";

            var unpinnedRows = this.eBodyContainer.querySelectorAll(".ag-row");
            for (var i = 0; i < unpinnedRows.length; i++) {
                unpinnedRows[i].style.width = mainRowWidth;
            }
        }

        findAllElements(gridPanel: any) {
            this.eBodyContainer = gridPanel.getBodyContainer();
            this.eBodyViewport = gridPanel.getBodyViewport();
            this.ePinnedColsContainer = gridPanel.getPinnedColsContainer();
            this.eParentOfRows = gridPanel.getRowsParent();
        }

        refreshView(refreshFromIndex: any) {
            if (!this.gridOptionsWrapper.isDontUseScrolls()) {
                var rowCount = this.rowModel.getVirtualRowCount();
                var containerHeight = this.gridOptionsWrapper.getRowHeight() * rowCount;
                this.eBodyContainer.style.height = containerHeight + "px";
                this.ePinnedColsContainer.style.height = containerHeight + "px";
            }

            this.refreshAllVirtualRows(refreshFromIndex);
        }

        softRefreshView() {

            var first = this.firstVirtualRenderedRow;
            var last = this.lastVirtualRenderedRow;

            var columns = this.columnModel.getDisplayedColumns();
            // if no cols, don't draw row
            if (!columns || columns.length === 0) {
                return;
            }

            for (var rowIndex = first; rowIndex <= last; rowIndex++) {
                var node = this.rowModel.getVirtualRow(rowIndex);
                if (node) {

                    for (var colIndex = 0; colIndex < columns.length; colIndex++) {
                        var column = columns[colIndex];
                        var renderedRow = this.renderedRows[rowIndex];
                        var eGridCell = renderedRow.eVolatileCells[column.colId];

                        if (!eGridCell) {
                            continue;
                        }

                        var isFirstColumn = colIndex === 0;
                        var scope = renderedRow.scope;

                        this.softRefreshCell(eGridCell, isFirstColumn, node, column, scope, rowIndex);
                    }
                }
            }
        }

        softRefreshCell(eGridCell: any, isFirstColumn: any, node: any, column: any, scope: any, rowIndex: any) {

            utils.removeAllChildren(eGridCell);

            var data = this.getDataForNode(node);
            var valueGetter = this.createValueGetter(data, column.colDef, node);

            var value: any;
            if (valueGetter) {
                value = valueGetter();
            }

            this.populateAndStyleGridCell(valueGetter, value, eGridCell, isFirstColumn, node, column, rowIndex, scope);

            // if angular compiling, then need to also compile the cell again (angular compiling sucks, please wait...)
            if (this.gridOptionsWrapper.isAngularCompileRows()) {
                this.$compile(eGridCell)(scope);
            }
        }

        rowDataChanged(rows: any) {
            // we only need to be worried about rendered rows, as this method is
            // called to whats rendered. if the row isn't rendered, we don't care
            var indexesToRemove: any = [];
            var renderedRows = this.renderedRows;
            Object.keys(renderedRows).forEach(function (key) {
                var renderedRow = renderedRows[key];
                // see if the rendered row is in the list of rows we have to update
                var rowNeedsUpdating = rows.indexOf(renderedRow.node.data) >= 0;
                if (rowNeedsUpdating) {
                    indexesToRemove.push(key);
                }
            });
            // remove the rows
            this.removeVirtualRows(indexesToRemove);
            // add draw them again
            this.drawVirtualRows();
        }

        refreshAllVirtualRows(fromIndex: any) {
            // remove all current virtual rows, as they have old data
            var rowsToRemove = Object.keys(this.renderedRows);
            this.removeVirtualRows(rowsToRemove, fromIndex);

            // add in new rows
            this.drawVirtualRows();
        }

// public - removes the group rows and then redraws them again
        refreshGroupRows() {
            // find all the group rows
            var rowsToRemove: any = [];
            var that = this;
            Object.keys(this.renderedRows).forEach(function (key) {
                var renderedRow = that.renderedRows[key];
                var node = renderedRow.node;
                if (node.group) {
                    rowsToRemove.push(key);
                }
            });
            // remove the rows
            this.removeVirtualRows(rowsToRemove);
            // and draw them back again
            this.ensureRowsRendered();
        }

// takes array of row indexes
        removeVirtualRows(rowsToRemove: any, fromIndex?: any) {
            var that = this;
            // if no fromIndex then set to -1, which will refresh everything
            var realFromIndex = (typeof fromIndex === 'number') ? fromIndex : -1;
            rowsToRemove.forEach(function (indexToRemove: any) {
                if (indexToRemove >= realFromIndex) {
                    that.removeVirtualRow(indexToRemove);

                    // if the row was last to have focus, we remove the fact that it has focus
                    if (that.focusedCell && that.focusedCell.rowIndex == indexToRemove) {
                        that.focusedCell = null;
                    }
                }
            });
        }

        removeVirtualRow(indexToRemove: any) {
            var renderedRow = this.renderedRows[indexToRemove];
            if (renderedRow.pinnedElement && this.ePinnedColsContainer) {
                this.ePinnedColsContainer.removeChild(renderedRow.pinnedElement);
            }

            if (renderedRow.bodyElement) {
                this.eBodyContainer.removeChild(renderedRow.bodyElement);
            }

            if (renderedRow.scope) {
                renderedRow.scope.$destroy();
            }

            if (this.gridOptionsWrapper.getVirtualRowRemoved()) {
                this.gridOptionsWrapper.getVirtualRowRemoved()(renderedRow.data, indexToRemove);
            }
            this.angularGrid.onVirtualRowRemoved(indexToRemove);

            delete this.renderedRows[indexToRemove];
            delete this.renderedRowStartEditingListeners[indexToRemove];
        }

        drawVirtualRows() {
            var first: any;
            var last: any;

            var rowCount = this.rowModel.getVirtualRowCount();

            if (this.gridOptionsWrapper.isDontUseScrolls()) {
                first = 0;
                last = rowCount;
            } else {
                var topPixel = this.eBodyViewport.scrollTop;
                var bottomPixel = topPixel + this.eBodyViewport.offsetHeight;

                first = Math.floor(topPixel / this.gridOptionsWrapper.getRowHeight());
                last = Math.floor(bottomPixel / this.gridOptionsWrapper.getRowHeight());

                //add in buffer
                var buffer = this.gridOptionsWrapper.getRowBuffer() || constants.ROW_BUFFER_SIZE;
                first = first - buffer;
                last = last + buffer;

                // adjust, in case buffer extended actual size
                if (first < 0) {
                    first = 0;
                }
                if (last > rowCount - 1) {
                    last = rowCount - 1;
                }
            }

            this.firstVirtualRenderedRow = first;
            this.lastVirtualRenderedRow = last;

            this.ensureRowsRendered();
        }

        getFirstVirtualRenderedRow() {
            return this.firstVirtualRenderedRow;
        }

        getLastVirtualRenderedRow() {
            return this.lastVirtualRenderedRow;
        }

        ensureRowsRendered() {

            var mainRowWidth = this.columnModel.getBodyContainerWidth();
            var that = this;

            // at the end, this array will contain the items we need to remove
            var rowsToRemove = Object.keys(this.renderedRows);

            // add in new rows
            for (var rowIndex = this.firstVirtualRenderedRow; rowIndex <= this.lastVirtualRenderedRow; rowIndex++) {
                // see if item already there, and if yes, take it out of the 'to remove' array
                if (rowsToRemove.indexOf(rowIndex.toString()) >= 0) {
                    rowsToRemove.splice(rowsToRemove.indexOf(rowIndex.toString()), 1);
                    continue;
                }
                // check this row actually exists (in case overflow buffer window exceeds real data)
                var node = this.rowModel.getVirtualRow(rowIndex);
                if (node) {
                    that.insertRow(node, rowIndex, mainRowWidth);
                }
            }

            // at this point, everything in our 'rowsToRemove' . . .
            this.removeVirtualRows(rowsToRemove);

            // if we are doing angular compiling, then do digest the scope here
            if (this.gridOptionsWrapper.isAngularCompileRows()) {
                // we do it in a timeout, in case we are already in an apply
                setTimeout(function () {
                    that.$scope.$apply();
                }, 0);
            }
        }

        insertRow(node: any, rowIndex: any, mainRowWidth: any) {
            var columns = this.columnModel.getDisplayedColumns();
            // if no cols, don't draw row
            if (!columns || columns.length == 0) {
                return;
            }

            // var rowData = node.rowData;
            var rowIsAGroup = node.group;

            // try compiling as we insert rows
            var newChildScope = this.createChildScopeOrNull(node.data);

            var ePinnedRow = this.createRowContainer(rowIndex, node, rowIsAGroup, newChildScope);
            var eMainRow = this.createRowContainer(rowIndex, node, rowIsAGroup, newChildScope);
            var that = this;

            eMainRow.style.width = mainRowWidth + "px";

            var renderedRow = {
                scope: newChildScope,
                node: node,
                rowIndex: rowIndex,
                eCells: {},
                eVolatileCells: {},
                pinnedElement: <any> null,
                bodyElement: <any> null
            };
            this.renderedRows[rowIndex] = renderedRow;
            this.renderedRowStartEditingListeners[rowIndex] = {};

            // if group item, insert the first row
            var groupHeaderTakesEntireRow = this.gridOptionsWrapper.isGroupUseEntireRow();
            var drawGroupRow = rowIsAGroup && groupHeaderTakesEntireRow;

            if (drawGroupRow) {
                var firstColumn = columns[0];

                var eGroupRow = that.createGroupElement(node, rowIndex, false);
                if (firstColumn.pinned) {
                    ePinnedRow.appendChild(eGroupRow);

                    var eGroupRowPadding = that.createGroupElement(node, rowIndex, true);
                    eMainRow.appendChild(eGroupRowPadding);
                } else {
                    eMainRow.appendChild(eGroupRow);
                }

            } else {

                columns.forEach(function (column: any, index: any) {
                    var firstCol = index === 0;
                    var data = that.getDataForNode(node);
                    var valueGetter = that.createValueGetter(data, column.colDef, node);
                    that.createCellFromColDef(firstCol, column, valueGetter, node, rowIndex, eMainRow, ePinnedRow, newChildScope, renderedRow);
                });
            }

            //try compiling as we insert rows
            renderedRow.pinnedElement = this.compileAndAdd(this.ePinnedColsContainer, rowIndex, ePinnedRow, newChildScope);
            renderedRow.bodyElement = this.compileAndAdd(this.eBodyContainer, rowIndex, eMainRow, newChildScope);
        }

// if group is a footer, always show the data.
// if group is a header, only show data if not expanded
        getDataForNode(node: any) {
            if (node.footer) {
                // if footer, we always show the data
                return node.data;
            } else if (node.group) {
                // if header and header is expanded, we show data in footer only
                var footersEnabled = this.gridOptionsWrapper.isGroupIncludeFooter();
                return (node.expanded && footersEnabled) ? undefined : node.data;
            } else {
                // otherwise it's a normal node, just return data as normal
                return node.data;
            }
        }

        createValueGetter(data: any, colDef: any, node: any) {
            var that = this;
            return function () {
                var api = that.gridOptionsWrapper.getApi();
                var context = that.gridOptionsWrapper.getContext();
                return utils.getValue(that.expressionService, data, colDef, node, api, context);
            };
        }

        createChildScopeOrNull(data: any) {
            if (this.gridOptionsWrapper.isAngularCompileRows()) {
                var newChildScope = this.$scope.$new();
                newChildScope.data = data;
                return newChildScope;
            } else {
                return null;
            }
        }

        compileAndAdd(container: any, rowIndex: any, element: any, scope: any) {
            if (scope) {
                var eElementCompiled = this.$compile(element)(scope);
                if (container) { // checking container, as if noScroll, pinned container is missing
                    container.appendChild(eElementCompiled[0]);
                }
                return eElementCompiled[0];
            } else {
                if (container) {
                    container.appendChild(element);
                }
                return element;
            }
        }

        createCellFromColDef(isFirstColumn: any, column: any, valueGetter: any, node: any, rowIndex: any, eMainRow:
            any, ePinnedRow: any, $childScope: any, renderedRow: any) {
            var eGridCell = this.createCell(isFirstColumn, column, valueGetter, node, rowIndex, $childScope);

            if (column.colDef.volatile) {
                renderedRow.eVolatileCells[column.colId] = eGridCell;
            }
            renderedRow.eCells[column.colId] = eGridCell;

            if (column.pinned) {
                ePinnedRow.appendChild(eGridCell);
            } else {
                eMainRow.appendChild(eGridCell);
            }
        }

        addClassesToRow(rowIndex: any, node: any, eRow: any) {
            var classesList = ["ag-row"];
            classesList.push(rowIndex % 2 == 0 ? "ag-row-even" : "ag-row-odd");

            if (this.selectionController.isNodeSelected(node)) {
                classesList.push("ag-row-selected");
            }
            if (node.group) {
                // if a group, put the level of the group in
                classesList.push("ag-row-level-" + node.level);
            } else {
                // if a leaf, and a parent exists, put a level of the parent, else put level of 0 for top level item
                if (node.parent) {
                    classesList.push("ag-row-level-" + (node.parent.level + 1));
                } else {
                    classesList.push("ag-row-level-0");
                }
            }
            if (node.group) {
                classesList.push("ag-row-group");
            }
            if (node.group && !node.footer && node.expanded) {
                classesList.push("ag-row-group-expanded");
            }
            if (node.group && !node.footer && !node.expanded) {
                // opposite of expanded is contracted according to the internet.
                classesList.push("ag-row-group-contracted");
            }
            if (node.group && node.footer) {
                classesList.push("ag-row-footer");
            }

            // add in extra classes provided by the config
            if (this.gridOptionsWrapper.getRowClass()) {
                var gridOptionsRowClass = this.gridOptionsWrapper.getRowClass();

                var classToUse: any;
                if (typeof gridOptionsRowClass === 'function') {
                    var params = {
                        node: node,
                        data: node.data,
                        rowIndex: rowIndex,
                        context: this.gridOptionsWrapper.getContext(),
                        api: this.gridOptionsWrapper.getApi()
                    };
                    classToUse = gridOptionsRowClass(params);
                } else {
                    classToUse = gridOptionsRowClass;
                }

                if (classToUse) {
                    if (typeof classToUse === 'string') {
                        classesList.push(classToUse);
                    } else if (Array.isArray(classToUse)) {
                        classToUse.forEach(function (classItem: any) {
                            classesList.push(classItem);
                        });
                    }
                }
            }

            var classes = classesList.join(" ");

            eRow.className = classes;
        }

        createRowContainer(rowIndex: any, node: any, groupRow: any, $scope: any) {
            var eRow = document.createElement("div");

            this.addClassesToRow(rowIndex, node, eRow);

            eRow.setAttribute('row', rowIndex);

            // if showing scrolls, position on the container
            if (!this.gridOptionsWrapper.isDontUseScrolls()) {
                eRow.style.top = (this.gridOptionsWrapper.getRowHeight() * rowIndex) + "px";
            }
            eRow.style.height = (this.gridOptionsWrapper.getRowHeight()) + "px";

            if (this.gridOptionsWrapper.getRowStyle()) {
                var cssToUse: any;
                var rowStyle = this.gridOptionsWrapper.getRowStyle();
                if (typeof rowStyle === 'function') {
                    var params = {
                        data: node.data,
                        node: node,
                        api: this.gridOptionsWrapper.getApi(),
                        context: this.gridOptionsWrapper.getContext(),
                        $scope: $scope
                    };
                    cssToUse = rowStyle(params);
                } else {
                    cssToUse = rowStyle;
                }

                if (cssToUse) {
                    Object.keys(cssToUse).forEach(function (key: any) {
                        eRow.style[key] = cssToUse[key];
                    });
                }
            }

            var _this = this;
            eRow.addEventListener("click", function (event) {
                _this.angularGrid.onRowClicked(event, Number(this.getAttribute("row")), node)
            });

            return eRow;
        }

        getIndexOfRenderedNode(node: any) {
            var renderedRows = this.renderedRows;
            var keys = Object.keys(renderedRows);
            for (var i = 0; i < keys.length; i++) {
                if (renderedRows[keys[i]].node === node) {
                    return renderedRows[keys[i]].rowIndex;
                }
            }
            return -1;
        }

        createGroupElement(node: any, rowIndex: any, padding: any) {
            var eRow: any;
            // padding means we are on the right hand side of a pinned table, ie
            // in the main body.
            if (padding) {
                eRow = document.createElement('span');
            } else {
                var params = {
                    node: node,
                    data: node.data,
                    rowIndex: rowIndex,
                    api: this.gridOptionsWrapper.getApi(),
                    colDef: {
                        cellRenderer: {
                            renderer: 'group',
                            innerRenderer: this.gridOptionsWrapper.getGroupRowInnerRenderer()
                        }
                    }
                };
                eRow = this.cellRendererMap['group'](params);
            }

            if (node.footer) {
                utils.addCssClass(eRow, 'ag-footer-cell-entire-row');
            } else {
                utils.addCssClass(eRow, 'ag-group-cell-entire-row');
            }

            return eRow;
        }

        putDataIntoCell(column: any, value: any, valueGetter: any, node: any, $childScope: any, eSpanWithValue: any,
                        eGridCell: any, rowIndex: any, refreshCellFunction: any) {
            // template gets preference, then cellRenderer, then do it ourselves
            var colDef = column.colDef;
            if (colDef.template) {
                eSpanWithValue.innerHTML = colDef.template;
            } else if (colDef.templateUrl) {
                var template = this.templateService.getTemplate(colDef.templateUrl, refreshCellFunction);
                if (template) {
                    eSpanWithValue.innerHTML = template;
                }
            } else if (colDef.cellRenderer) {
                this.useCellRenderer(column, value, node, $childScope, eSpanWithValue, rowIndex, refreshCellFunction, valueGetter, eGridCell);
            } else {
                // if we insert undefined, then it displays as the string 'undefined', ugly!
                if (value !== undefined && value !== null && value !== '') {
                    eSpanWithValue.innerHTML = value;
                }
            }
        }

        useCellRenderer(column: any, value: any, node: any, $childScope: any, eSpanWithValue: any, rowIndex: any,
                        refreshCellFunction: any, valueGetter: any, eGridCell: any) {
            var colDef = column.colDef;
            var rendererParams = {
                value: value,
                valueGetter: valueGetter,
                data: node.data,
                node: node,
                colDef: colDef,
                column: column,
                $scope: $childScope,
                rowIndex: rowIndex,
                api: this.gridOptionsWrapper.getApi(),
                context: this.gridOptionsWrapper.getContext(),
                refreshCell: refreshCellFunction,
                eGridCell: eGridCell
            };
            var cellRenderer: any;
            if (typeof colDef.cellRenderer === 'object' && colDef.cellRenderer !== null) {
                cellRenderer = this.cellRendererMap[colDef.cellRenderer.renderer];
                if (!cellRenderer) {
                    throw 'Cell renderer ' + colDef.cellRenderer + ' not found, available are ' + Object.keys(this.cellRendererMap);
                }
            } else if (typeof colDef.cellRenderer === 'function') {
                cellRenderer = colDef.cellRenderer;
            } else {
                throw 'Cell Renderer must be String or Function';
            }
            var resultFromRenderer = cellRenderer(rendererParams);
            if (utils.isNodeOrElement(resultFromRenderer)) {
                // a dom node or element was returned, so add child
                eSpanWithValue.appendChild(resultFromRenderer);
            } else {
                // otherwise assume it was html, so just insert
                eSpanWithValue.innerHTML = resultFromRenderer;
            }
        }

        addStylesFromCollDef(column: any, value: any, node: any, $childScope: any, eGridCell: any) {
            var colDef = column.colDef;
            if (colDef.cellStyle) {
                var cssToUse: any;
                if (typeof colDef.cellStyle === 'function') {
                    var cellStyleParams = {
                        value: value,
                        data: node.data,
                        node: node,
                        colDef: colDef,
                        column: column,
                        $scope: $childScope,
                        context: this.gridOptionsWrapper.getContext(),
                        api: this.gridOptionsWrapper.getApi()
                    };
                    cssToUse = colDef.cellStyle(cellStyleParams);
                } else {
                    cssToUse = colDef.cellStyle;
                }

                if (cssToUse) {
                    utils.addStylesToElement(eGridCell, cssToUse);
                }
            }
        }

        addClassesFromCollDef(colDef: any, value: any, node: any, $childScope: any, eGridCell: any) {
            if (colDef.cellClass) {
                var classToUse: any;
                if (typeof colDef.cellClass === 'function') {
                    var cellClassParams = {
                        value: value,
                        data: node.data,
                        node: node,
                        colDef: colDef,
                        $scope: $childScope,
                        context: this.gridOptionsWrapper.getContext(),
                        api: this.gridOptionsWrapper.getApi()
                    };
                    classToUse = colDef.cellClass(cellClassParams);
                } else {
                    classToUse = colDef.cellClass;
                }

                if (typeof classToUse === 'string') {
                    utils.addCssClass(eGridCell, classToUse);
                } else if (Array.isArray(classToUse)) {
                    classToUse.forEach(function (cssClassItem: any) {
                        utils.addCssClass(eGridCell, cssClassItem);
                    });
                }
            }
        }

        addClassesToCell(column: any, node: any, eGridCell: any) {
            var classes = ['ag-cell', 'ag-cell-no-focus', 'cell-col-' + column.index];
            if (node.group) {
                if (node.footer) {
                    classes.push('ag-footer-cell');
                } else {
                    classes.push('ag-group-cell');
                }
            }
            eGridCell.className = classes.join(' ');
        }

        addClassesFromRules(colDef: any, eGridCell: any, value: any, node: any, rowIndex: any) {
            var classRules = colDef.cellClassRules;
            if (typeof classRules === 'object' && classRules !== null) {

                var params = {
                    value: value,
                    data: node.data,
                    node: node,
                    colDef: colDef,
                    rowIndex: rowIndex,
                    api: this.gridOptionsWrapper.getApi(),
                    context: this.gridOptionsWrapper.getContext()
                };

                var classNames = Object.keys(classRules);
                for (var i = 0; i < classNames.length; i++) {
                    var className = classNames[i];
                    var rule = classRules[className];
                    var resultOfRule: any;
                    if (typeof rule === 'string') {
                        resultOfRule = this.expressionService.evaluate(rule, params);
                    } else if (typeof rule === 'function') {
                        resultOfRule = rule(params);
                    }
                    if (resultOfRule) {
                        utils.addCssClass(eGridCell, className);
                    } else {
                        utils.removeCssClass(eGridCell, className);
                    }
                }
            }
        }

        createCell(isFirstColumn: any, column: any, valueGetter: any, node: any, rowIndex: any, $childScope: any) {
            var that = this;
            var eGridCell = document.createElement("div");
            eGridCell.setAttribute("col", column.index);

            // only set tab index if cell selection is enabled
            if (!this.gridOptionsWrapper.isSuppressCellSelection()) {
                eGridCell.setAttribute("tabindex", "-1");
            }

            var value: any;
            if (valueGetter) {
                value = valueGetter();
            }

            // these are the grid styles, don't change between soft refreshes
            this.addClassesToCell(column, node, eGridCell);

            this.populateAndStyleGridCell(valueGetter, value, eGridCell, isFirstColumn, node, column, rowIndex, $childScope);

            this.addCellClickedHandler(eGridCell, node, column, value, rowIndex);
            this.addCellDoubleClickedHandler(eGridCell, node, column, value, rowIndex, $childScope, isFirstColumn, valueGetter);

            this.addCellNavigationHandler(eGridCell, rowIndex, column, node);

            eGridCell.style.width = utils.formatWidth(column.actualWidth);

            // add the 'start editing' call to the chain of editors
            this.renderedRowStartEditingListeners[rowIndex][column.colId] = function () {
                if (that.isCellEditable(column.colDef, node)) {
                    that.startEditing(eGridCell, column, node, $childScope, rowIndex, isFirstColumn, valueGetter);
                    return true;
                } else {
                    return false;
                }
            };

            return eGridCell;
        }

        addCellNavigationHandler(eGridCell: any, rowIndex: any, column: any, node: any) {
            var that = this;
            eGridCell.addEventListener('keydown', function (event: any) {
                if (that.editingCell) {
                    return;
                }
                // only interested on key presses that are directly on this element, not any children elements. this
                // stops navigation if the user is in, for example, a text field inside the cell, and user hits
                // on of the keys we are looking for.
                if (event.target !== eGridCell) {
                    return;
                }

                var key = event.which || event.keyCode;

                var startNavigation = key === constants.KEY_DOWN || key === constants.KEY_UP
                    || key === constants.KEY_LEFT || key === constants.KEY_RIGHT;
                if (startNavigation) {
                    event.preventDefault();
                    that.navigateToNextCell(key, rowIndex, column);
                }

                var startEdit = key === constants.KEY_ENTER;
                if (startEdit) {
                    var startEditingFunc = that.renderedRowStartEditingListeners[rowIndex][column.colId];
                    if (startEditingFunc) {
                        var editingStarted = startEditingFunc();
                        if (editingStarted) {
                            // if we don't prevent default, then the editor that get displayed also picks up the 'enter key'
                            // press, and stops editing immediately, hence giving he user experience that nothing happened
                            event.preventDefault();
                        }
                    }
                }

                var selectRow = key === constants.KEY_SPACE;
                if (selectRow && that.gridOptionsWrapper.isRowSelection()) {
                    var selected = that.selectionController.isNodeSelected(node);
                    if (selected) {
                        that.selectionController.deselectNode(node);
                    } else {
                        that.selectionController.selectNode(node, true);
                    }
                    event.preventDefault();
                }
            });
        }

// we use index for rows, but column object for columns, as the next column (by index) might not
// be visible (header grouping) so it's not reliable, so using the column object instead.
        navigateToNextCell(key: any, rowIndex: any, column: any) {

            var cellToFocus = {rowIndex: rowIndex, column: column};
            var renderedRow: any;
            var eCell: any;

            // we keep searching for a next cell until we find one. this is how the group rows get skipped
            while (!eCell) {
                cellToFocus = this.getNextCellToFocus(key, cellToFocus);
                // no next cell means we have reached a grid boundary, eg left, right, top or bottom of grid
                if (!cellToFocus) {
                    return;
                }
                // see if the next cell is selectable, if yes, use it, if not, skip it
                renderedRow = this.renderedRows[cellToFocus.rowIndex];
                eCell = renderedRow.eCells[cellToFocus.column.colId];
            }

            // this scrolls the row into view
            this.gridPanel.ensureIndexVisible(renderedRow.rowIndex);

            // this changes the css on the cell
            this.focusCell(eCell, cellToFocus.rowIndex, cellToFocus.column.index, true);
        }

        getNextCellToFocus(key: any, lastCellToFocus: any) {
            var lastRowIndex = lastCellToFocus.rowIndex;
            var lastColumn = lastCellToFocus.column;

            var nextRowToFocus: any;
            var nextColumnToFocus: any;
            switch (key) {
                case constants.KEY_UP :
                    // if already on top row, do nothing
                    if (lastRowIndex === this.firstVirtualRenderedRow) {
                        return null;
                    }
                    nextRowToFocus = lastRowIndex - 1;
                    nextColumnToFocus = lastColumn;
                    break;
                case constants.KEY_DOWN :
                    // if already on bottom, do nothing
                    if (lastRowIndex === this.lastVirtualRenderedRow) {
                        return null;
                    }
                    nextRowToFocus = lastRowIndex + 1;
                    nextColumnToFocus = lastColumn;
                    break;
                case constants.KEY_RIGHT :
                    var colToRight = this.columnModel.getVisibleColAfter(lastColumn);
                    // if already on right, do nothing
                    if (!colToRight) {
                        return null;
                    }
                    nextRowToFocus = lastRowIndex;
                    nextColumnToFocus = colToRight;
                    break;
                case constants.KEY_LEFT :
                    var colToLeft = this.columnModel.getVisibleColBefore(lastColumn);
                    // if already on left, do nothing
                    if (!colToLeft) {
                        return null;
                    }
                    nextRowToFocus = lastRowIndex;
                    nextColumnToFocus = colToLeft;
                    break;
            }

            return {
                rowIndex: nextRowToFocus,
                column: nextColumnToFocus
            };
        }

// called internally
        focusCell(eCell: any, rowIndex: any, colIndex: any, forceBrowserFocus: any) {
            // do nothing if cell selection is off
            if (this.gridOptionsWrapper.isSuppressCellSelection()) {
                return;
            }

            // remove any previous focus
            utils.querySelectorAll_replaceCssClass(this.eParentOfRows, '.ag-cell-focus', 'ag-cell-focus', 'ag-cell-no-focus');

            var selectorForCell = '[row="' + rowIndex + '"] [col="' + colIndex + '"]';
            utils.querySelectorAll_replaceCssClass(this.eParentOfRows, selectorForCell, 'ag-cell-no-focus', 'ag-cell-focus');

            this.focusedCell = {rowIndex: rowIndex, colIndex: colIndex, node: this.rowModel.getVirtualRow(rowIndex)};

            // this puts the browser focus on the cell (so it gets key presses)
            if (forceBrowserFocus) {
                eCell.focus();
            }

            if (typeof this.gridOptionsWrapper.getCellFocused() === 'function') {
                this.gridOptionsWrapper.getCellFocused()(this.focusedCell);
            }
        }

// for API
        getFocusedCell() {
            return this.focusedCell;
        }

// called via API
        setFocusedCell(rowIndex: any, colIndex: any) {
            var renderedRow = this.renderedRows[rowIndex];
            var column = this.columnModel.getDisplayedColumns()[colIndex];
            if (renderedRow && column) {
                var eCell = renderedRow.eCells[column.colId];
                this.focusCell(eCell, rowIndex, colIndex, true);
            }
        }

        populateAndStyleGridCell(valueGetter: any, value: any, eGridCell: any, isFirstColumn: any,
                                 node: any, column: any, rowIndex: any, $childScope: any) {
            var colDef = column.colDef;

            // populate
            this.populateGridCell(eGridCell, isFirstColumn, node, column, rowIndex, value, valueGetter, $childScope);
            // style
            this.addStylesFromCollDef(column, value, node, $childScope, eGridCell);
            this.addClassesFromCollDef(colDef, value, node, $childScope, eGridCell);
            this.addClassesFromRules(colDef, eGridCell, value, node, rowIndex);
        }

        populateGridCell(eGridCell: any, isFirstColumn: any, node: any, column: any, rowIndex: any,
                         value: any, valueGetter: any, $childScope: any) {
            var eCellWrapper = document.createElement('span');
            utils.addCssClass(eCellWrapper, "ag-cell-wrapper");
            eGridCell.appendChild(eCellWrapper);

            var colDef = column.colDef;
            if (colDef.checkboxSelection) {
                var eCheckbox = this.selectionRendererFactory.createSelectionCheckbox(node, rowIndex);
                eCellWrapper.appendChild(eCheckbox);
            }

            // eventually we call eSpanWithValue.innerHTML = xxx, so cannot include the checkbox (above) in this span
            var eSpanWithValue = document.createElement("span");
            utils.addCssClass(eSpanWithValue, "ag-cell-value");

            eCellWrapper.appendChild(eSpanWithValue);

            var that = this;
            var refreshCellFunction = function () {
                that.softRefreshCell(eGridCell, isFirstColumn, node, column, $childScope, rowIndex);
            };

            this.putDataIntoCell(column, value, valueGetter, node, $childScope, eSpanWithValue, eGridCell, rowIndex, refreshCellFunction);
        }

        addCellDoubleClickedHandler(eGridCell: any, node: any, column: any, value: any, rowIndex: any,
                                    $childScope: any, isFirstColumn: any, valueGetter: any) {
            var that = this;
            var colDef = column.colDef;
            eGridCell.addEventListener('dblclick', function (event: any) {
                if (that.gridOptionsWrapper.getCellDoubleClicked()) {
                    var paramsForGrid = {
                        node: node,
                        data: node.data,
                        value: value,
                        rowIndex: rowIndex,
                        colDef: colDef,
                        event: event,
                        eventSource: this,
                        api: that.gridOptionsWrapper.getApi()
                    };
                    that.gridOptionsWrapper.getCellDoubleClicked()(paramsForGrid);
                }
                if (colDef.cellDoubleClicked) {
                    var paramsForColDef = {
                        node: node,
                        data: node.data,
                        value: value,
                        rowIndex: rowIndex,
                        colDef: colDef,
                        event: event,
                        eventSource: this,
                        api: that.gridOptionsWrapper.getApi()
                    };
                    colDef.cellDoubleClicked(paramsForColDef);
                }
                if (that.isCellEditable(colDef, node)) {
                    that.startEditing(eGridCell, column, node, $childScope, rowIndex, isFirstColumn, valueGetter);
                }
            });
        }

        addCellClickedHandler(eGridCell: any, node: any, column: any, value: any, rowIndex: any) {
            var colDef = column.colDef;
            var that = this;
            eGridCell.addEventListener("click", function (event: any) {
                // we pass false to focusCell, as we don't want the cell to focus
                // also get the browser focus. if we did, then the cellRenderer could
                // have a text field in it, for example, and as the user clicks on the
                // text field, the text field, the focus doesn't get to the text
                // field, instead to goes to the div behind, making it impossible to
                // select the text field.
                that.focusCell(eGridCell, rowIndex, column.index, false);
                if (that.gridOptionsWrapper.getCellClicked()) {
                    var paramsForGrid = {
                        node: node,
                        data: node.data,
                        value: value,
                        rowIndex: rowIndex,
                        colDef: colDef,
                        event: event,
                        eventSource: this,
                        api: that.gridOptionsWrapper.getApi()
                    };
                    that.gridOptionsWrapper.getCellClicked()(paramsForGrid);
                }
                if (colDef.cellClicked) {
                    var paramsForColDef = {
                        node: node,
                        data: node.data,
                        value: value,
                        rowIndex: rowIndex,
                        colDef: colDef,
                        event: event,
                        eventSource: this,
                        api: that.gridOptionsWrapper.getApi()
                    };
                    colDef.cellClicked(paramsForColDef);
                }
            });
        }

        isCellEditable(colDef: any, node: any) {
            if (this.editingCell) {
                return false;
            }

            // never allow editing of groups
            if (node.group) {
                return false;
            }

            // if boolean set, then just use it
            if (typeof colDef.editable === 'boolean') {
                return colDef.editable;
            }

            // if function, then call the function to find out
            if (typeof colDef.editable === 'function') {
                // should change this, so it gets passed params with nice useful values
                return colDef.editable(node.data);
            }

            return false;
        }

        stopEditing(eGridCell: any, column: any, node: any, $childScope: any, eInput: any, blurListener: any,
                    rowIndex: any, isFirstColumn: any, valueGetter: any) {
            this.editingCell = false;
            var newValue = eInput.value;
            var colDef = column.colDef;

            //If we don't remove the blur listener first, we get:
            //Uncaught NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is no longer a child of this node. Perhaps it was moved in a 'blur' event handler?
            eInput.removeEventListener('blur', blurListener);

            utils.removeAllChildren(eGridCell);

            var paramsForCallbacks = {
                node: node,
                data: node.data,
                oldValue: node.data[colDef.field],
                newValue: newValue,
                rowIndex: rowIndex,
                colDef: colDef,
                api: this.gridOptionsWrapper.getApi(),
                context: this.gridOptionsWrapper.getContext()
            };

            if (colDef.newValueHandler) {
                colDef.newValueHandler(paramsForCallbacks);
            } else {
                node.data[colDef.field] = newValue;
            }

            // at this point, the value has been updated
            var newValue: any;
            if (valueGetter) {
                newValue = valueGetter();
            }
            paramsForCallbacks.newValue = newValue;
            if (typeof colDef.cellValueChanged === 'function') {
                colDef.cellValueChanged(paramsForCallbacks);
            }
            if (typeof this.gridOptionsWrapper.getCellValueChanged() === 'function') {
                this.gridOptionsWrapper.getCellValueChanged()(paramsForCallbacks);
            }

            this.populateAndStyleGridCell(valueGetter, newValue, eGridCell, isFirstColumn, node, column, rowIndex, $childScope);
        }

        startEditing(eGridCell: any, column: any, node: any, $childScope: any, rowIndex: any,
                     isFirstColumn: any, valueGetter: any) {
            var that = this;
            this.editingCell = true;
            utils.removeAllChildren(eGridCell);
            var eInput = document.createElement('input');
            eInput.type = 'text';
            utils.addCssClass(eInput, 'ag-cell-edit-input');

            if (valueGetter) {
                var value = valueGetter();
                if (value !== null && value !== undefined) {
                    eInput.value = value;
                }
            }

            eInput.style.width = (column.actualWidth - 14) + 'px';
            eGridCell.appendChild(eInput);
            eInput.focus();
            eInput.select();

            var blurListener = function () {
                that.stopEditing(eGridCell, column, node, $childScope, eInput, blurListener, rowIndex, isFirstColumn, valueGetter);
            };

            //stop entering if we loose focus
            eInput.addEventListener("blur", blurListener);

            //stop editing if enter pressed
            eInput.addEventListener('keypress', function (event) {
                var key = event.which || event.keyCode;
                // 13 is enter
                if (key == constants.KEY_ENTER) {
                    that.stopEditing(eGridCell, column, node, $childScope, eInput, blurListener, rowIndex, isFirstColumn, valueGetter);
                    that.focusCell(eGridCell, rowIndex, column.index, true);
                }
            });

            // tab key doesn't generate keypress, so need keydown to listen for that
            eInput.addEventListener('keydown', function (event) {
                var key = event.which || event.keyCode;
                if (key == constants.KEY_TAB) {
                    that.stopEditing(eGridCell, column, node, $childScope, eInput, blurListener, rowIndex, isFirstColumn, valueGetter);
                    that.startEditingNextCell(rowIndex, column, event.shiftKey);
                    // we don't want the default tab action, so return false, this stops the event from bubbling
                    event.preventDefault();
                    return false;
                }
            });
        }

        startEditingNextCell(rowIndex: any, column: any, shiftKey: any) {

            var firstRowToCheck = this.firstVirtualRenderedRow;
            var lastRowToCheck = this.lastVirtualRenderedRow;
            var currentRowIndex = rowIndex;

            var visibleColumns = this.columnModel.getDisplayedColumns();
            var currentCol = column;

            while (true) {

                var indexOfCurrentCol = visibleColumns.indexOf(currentCol);

                // move backward
                if (shiftKey) {
                    // move along to the previous cell
                    currentCol = visibleColumns[indexOfCurrentCol - 1];
                    // check if end of the row, and if so, go back a row
                    if (!currentCol) {
                        currentCol = visibleColumns[visibleColumns.length - 1];
                        currentRowIndex--;
                    }

                    // if got to end of rendered rows, then quit looking
                    if (currentRowIndex < firstRowToCheck) {
                        return;
                    }
                    // move forward
                } else {
                    // move along to the next cell
                    currentCol = visibleColumns[indexOfCurrentCol + 1];
                    // check if end of the row, and if so, go forward a row
                    if (!currentCol) {
                        currentCol = visibleColumns[0];
                        currentRowIndex++;
                    }

                    // if got to end of rendered rows, then quit looking
                    if (currentRowIndex > lastRowToCheck) {
                        return;
                    }
                }

                var nextFunc = this.renderedRowStartEditingListeners[currentRowIndex][currentCol.colId];
                if (nextFunc) {
                    // see if the next cell is editable, and if so, we have come to
                    // the end of our search, so stop looking for the next cell
                    var nextCellAcceptedEdit = nextFunc();
                    if (nextCellAcceptedEdit) {
                        return;
                    }
                }
            }

        }
    }
}

