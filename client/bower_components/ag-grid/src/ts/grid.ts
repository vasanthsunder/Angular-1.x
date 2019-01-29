/// <reference path="constants.ts" />
/// <reference path="gridOptionsWrapper.ts" />
/// <reference path="utils.ts" />
/// <reference path="filter/filterManager.ts" />
/// <reference path="columnController.ts" />
/// <reference path="selectionController.ts" />
/// <reference path="selectionRendererFactory.ts" />
/// <reference path="rowRenderer.ts" />
/// <reference path="headerRenderer.ts" />
/// <reference path="rowControllers/inMemoryRowController.ts" />
/// <reference path="rowControllers/virtualPageRowController.ts" />
/// <reference path="rowControllers/paginationController.ts" />
/// <reference path="expressionService.ts" />
/// <reference path="templateService.ts" />
/// <reference path="gridPanel/gridPanel.ts" />
/// <reference path="toolPanel/toolPanel.ts" />
/// <reference path="widgets/agPopupService.ts" />
/// <reference path="gridOptions.ts" />

module awk.grid {

    var constants = Constants;
    var utils = Utils;
    var agPopupService = PopupService.getInstance();

    export class Grid {

        virtualRowCallbacks: any;
        gridOptions: GridOptions;
        gridOptionsWrapper: any;
        quickFilter: any;
        scrollWidth: any;
        inMemoryRowController: any;
        doingVirtualPaging: any;
        paginationController: any;
        virtualPageRowController: any;
        rowModel: any;
        finished: any;

        selectionController: any;
        columnController: any;
        columnModel: any;
        rowRenderer: any;
        headerRenderer: any;
        filterManager: any;
        eToolPanel: any;
        gridPanel: any;
        eRootPanel: any;
        toolPanelShowing: any;
        doingPagination: any;

        constructor(eGridDiv: any, gridOptions: any, $scope: any, $compile: any, quickFilterOnScope: any) {

            this.gridOptions = gridOptions;
            this.gridOptionsWrapper = new GridOptionsWrapper(this.gridOptions);

            this.addApi();
            this.setupComponents($scope, $compile, eGridDiv);

            var that = this;
            this.quickFilter = null;

            // if using angular, watch for quickFilter changes
            if ($scope) {
                $scope.$watch(quickFilterOnScope, function (newFilter: any) {
                    that.onQuickFilterChanged(newFilter);
                });
            }

            this.virtualRowCallbacks = {};


            this.scrollWidth = utils.getScrollbarWidth();

            // done when cols change
            this.setupColumns();

            this.inMemoryRowController.setAllRows(this.gridOptionsWrapper.getAllRows());

            var forPrint = this.gridOptionsWrapper.isDontUseScrolls();
            if (!forPrint) {
                window.addEventListener('resize', this.doLayout.bind(this));
            }

            this.updateModelAndRefresh(constants.STEP_EVERYTHING);

            // if no data provided initially, and not doing infinite scrolling, show the loading panel
            var showLoading = !this.gridOptionsWrapper.getAllRows() && !this.gridOptionsWrapper.isVirtualPaging();
            this.showLoadingPanel(showLoading);

            // if datasource provided, use it
            if (this.gridOptionsWrapper.getDatasource()) {
                this.setDatasource();
            }

            this.doLayout();

            this.finished = false;
            this.periodicallyDoLayout();

            // if ready function provided, use it
            if (typeof this.gridOptionsWrapper.getReady() == 'function') {
                this.gridOptionsWrapper.getReady()(gridOptions.api);
            }
        }

        periodicallyDoLayout() {
            if (!this.finished) {
                var that = this;
                setTimeout(function () {
                    that.doLayout();
                    that.periodicallyDoLayout();
                }, 500);
            }
        }

        setupComponents($scope: any, $compile: any, eUserProvidedDiv: any) {

            // make local references, to make the below more human readable
            var gridOptionsWrapper = this.gridOptionsWrapper;
            var gridOptions = this.gridOptions;
            var forPrint = gridOptionsWrapper.isDontUseScrolls();

            // create all the beans
            var selectionController = new SelectionController();
            var filterManager = new FilterManager();
            var selectionRendererFactory = new SelectionRendererFactory();
            var columnController = new ColumnController();
            var rowRenderer = new RowRenderer();
            var headerRenderer = new HeaderRenderer();
            var inMemoryRowController = new InMemoryRowController();
            var virtualPageRowController = new VirtualPageRowController();
            var expressionService = new ExpressionService();
            var templateService = new TemplateService();
            var gridPanel = new GridPanel(gridOptionsWrapper);

            var columnModel = columnController.getModel();

            // initialise all the beans
            templateService.init($scope);
            selectionController.init(this, gridPanel, gridOptionsWrapper, $scope, rowRenderer);
            filterManager.init(this, gridOptionsWrapper, $compile, $scope, expressionService, columnModel);
            selectionRendererFactory.init(this, selectionController);
            columnController.init(this, selectionRendererFactory, gridOptionsWrapper, expressionService);
            rowRenderer.init(gridOptions, columnModel, gridOptionsWrapper, gridPanel, this,
                selectionRendererFactory, $compile, $scope, selectionController, expressionService, templateService);
            headerRenderer.init(gridOptionsWrapper, columnController, columnModel, gridPanel, this, filterManager,
                $scope, $compile, expressionService);
            inMemoryRowController.init(gridOptionsWrapper, columnModel, this, filterManager, $scope, expressionService);
            virtualPageRowController.init(rowRenderer, gridOptionsWrapper, this);
            gridPanel.init(columnModel, rowRenderer);

            var toolPanelLayout: any = null;
            var eToolPanel: any = null;
            if (!forPrint) {
                eToolPanel = new ToolPanel();
                toolPanelLayout = eToolPanel.layout;
                eToolPanel.init(columnController, inMemoryRowController, gridOptionsWrapper, this.gridOptions.api);
            }

            // this is a child bean, get a reference and pass it on
            // CAN WE DELETE THIS? it's done in the setDatasource section
            var rowModel = inMemoryRowController.getModel();
            selectionController.setRowModel(rowModel);
            filterManager.setRowModel(rowModel);
            rowRenderer.setRowModel(rowModel);
            gridPanel.setRowModel(rowModel);

            // and the last bean, done in it's own section, as it's optional
            var paginationController: any = null;
            var paginationGui: any = null;
            if (!forPrint) {
                paginationController = new PaginationController();
                paginationController.init(this, gridOptionsWrapper);
                paginationGui = paginationController.getGui();
            }

            this.rowModel = rowModel;
            this.selectionController = selectionController;
            this.columnController = columnController;
            this.columnModel = columnModel;
            this.inMemoryRowController = inMemoryRowController;
            this.virtualPageRowController = virtualPageRowController;
            this.rowRenderer = rowRenderer;
            this.headerRenderer = headerRenderer;
            this.paginationController = paginationController;
            this.filterManager = filterManager;
            this.eToolPanel = eToolPanel;
            this.gridPanel = gridPanel;

            this.eRootPanel = new BorderLayout({
                center: gridPanel.layout,
                east: toolPanelLayout,
                south: paginationGui,
                dontFill: forPrint,
                name: 'eRootPanel'
            });
            agPopupService.init(this.eRootPanel.getGui());

            // default is we don't show paging panel, this is set to true when datasource is set
            this.eRootPanel.setSouthVisible(false);

            // see what the grid options are for default of toolbar
            this.showToolPanel(gridOptionsWrapper.isShowToolPanel());

            eUserProvidedDiv.appendChild(this.eRootPanel.getGui());
        }

        showToolPanel(show: any) {
            if (!this.eToolPanel) {
                this.toolPanelShowing = false;
                return;
            }

            this.toolPanelShowing = show;
            this.eRootPanel.setEastVisible(show);
        }

        isToolPanelShowing() {
            return this.toolPanelShowing;
        }

        setDatasource(datasource?: any) {
            // if datasource provided, then set it
            if (datasource) {
                this.gridOptions.datasource = datasource;
            }
            // get the set datasource (if null was passed to this method,
            // then need to get the actual datasource from options
            var datasourceToUse = this.gridOptionsWrapper.getDatasource();
            this.doingVirtualPaging = this.gridOptionsWrapper.isVirtualPaging() && datasourceToUse;
            this.doingPagination = datasourceToUse && !this.doingVirtualPaging;
            var showPagingPanel: any;

            if (this.doingVirtualPaging) {
                this.paginationController.setDatasource(null);
                this.virtualPageRowController.setDatasource(datasourceToUse);
                this.rowModel = this.virtualPageRowController.getModel();
                showPagingPanel = false;
            } else if (this.doingPagination) {
                this.paginationController.setDatasource(datasourceToUse);
                this.virtualPageRowController.setDatasource(null);
                this.rowModel = this.inMemoryRowController.getModel();
                showPagingPanel = true;
            } else {
                this.paginationController.setDatasource(null);
                this.virtualPageRowController.setDatasource(null);
                this.rowModel = this.inMemoryRowController.getModel();
                showPagingPanel = false;
            }

            this.selectionController.setRowModel(this.rowModel);
            this.filterManager.setRowModel(this.rowModel);
            this.rowRenderer.setRowModel(this.rowModel);

            this.eRootPanel.setSouthVisible(showPagingPanel);

            // because we just set the rowModel, need to update the gui
            this.rowRenderer.refreshView();

            this.doLayout();
        }

        // gets called after columns are shown / hidden from groups expanding
        refreshHeaderAndBody() {
            this.headerRenderer.refreshHeader();
            this.headerRenderer.updateFilterIcons();
            this.headerRenderer.updateSortIcons();
            this.gridPanel.setBodyContainerWidth();
            this.gridPanel.setPinnedColContainerWidth();
            this.rowRenderer.refreshView();
        }

        setFinished() {
            window.removeEventListener('resize', this.doLayout);
            this.finished = true;
        }

        getQuickFilter() {
            return this.quickFilter;
        }

        onQuickFilterChanged(newFilter: any) {
            if (newFilter === undefined || newFilter === "") {
                newFilter = null;
            }
            if (this.quickFilter !== newFilter) {
                if (this.gridOptionsWrapper.isVirtualPaging()) {
                    console.warn('ag-grid: cannot do quick filtering when doing virtual paging');
                    return;
                }

                //want 'null' to mean to filter, so remove undefined and empty string
                if (newFilter === undefined || newFilter === "") {
                    newFilter = null;
                }
                if (newFilter !== null) {
                    newFilter = newFilter.toUpperCase();
                }
                this.quickFilter = newFilter;
                this.onFilterChanged();
            }
        }

        onFilterChanged() {
            this.headerRenderer.updateFilterIcons();
            if (this.gridOptionsWrapper.isEnableServerSideFilter()) {
                // if doing server side filtering, changing the sort has the impact
                // of resetting the datasource
                this.setDatasource();
            } else {
                // if doing in memory filtering, we just update the in memory data
                this.updateModelAndRefresh(constants.STEP_FILTER);
            }
        }

        onRowClicked(event: any, rowIndex: any, node: any) {

            if (this.gridOptions.rowClicked) {
                var params = {
                    node: node,
                    data: node.data,
                    event: event,
                    rowIndex: rowIndex
                };
                this.gridOptions.rowClicked(params);
            }

            // we do not allow selecting groups by clicking (as the click here expands the group)
            // so return if it's a group row
            if (node.group) {
                return;
            }

            // making local variables to make the below more readable
            var gridOptionsWrapper = this.gridOptionsWrapper;
            var selectionController = this.selectionController;

            // if no selection method enabled, do nothing
            if (!gridOptionsWrapper.isRowSelection()) {
                return;
            }

            // if click selection suppressed, do nothing
            if (gridOptionsWrapper.isSuppressRowClickSelection()) {
                return;
            }

            // ctrlKey for windows, metaKey for Apple
            var ctrlKeyPressed = event.ctrlKey || event.metaKey;

            var doDeselect = ctrlKeyPressed
                && selectionController.isNodeSelected(node)
                && gridOptionsWrapper.isRowDeselection();

            if (doDeselect) {
                selectionController.deselectNode(node);
            } else {
                var tryMulti = ctrlKeyPressed;
                selectionController.selectNode(node, tryMulti);
            }
        }

        showLoadingPanel(show: any) {
            this.gridPanel.showLoading(show);
        }

        setupColumns() {
            this.gridPanel.setHeaderHeight();
            this.columnController.setColumns(this.gridOptionsWrapper.getColumnDefs());
            this.gridPanel.showPinnedColContainersIfNeeded();
            this.headerRenderer.refreshHeader();
            if (!this.gridOptionsWrapper.isDontUseScrolls()) {
                this.gridPanel.setPinnedColContainerWidth();
                this.gridPanel.setBodyContainerWidth();
            }
            this.headerRenderer.updateFilterIcons();
        }

        // rowsToRefresh is at what index to start refreshing the rows. the assumption is
        // if we are expanding or collapsing a group, then only he rows below the group
        // need to be refresh. this allows the context (eg focus) of the other cells to
        // remain.
        updateModelAndRefresh(step: any, refreshFromIndex?: any) {
            this.inMemoryRowController.updateModel(step);
            this.rowRenderer.refreshView(refreshFromIndex);
        }

        setRows(rows?: any, firstId?: any) {
            if (rows) {
                this.gridOptions.rowData = rows;
            }
            this.inMemoryRowController.setAllRows(this.gridOptionsWrapper.getAllRows(), firstId);
            this.selectionController.deselectAll();
            this.filterManager.onNewRowsLoaded();
            this.updateModelAndRefresh(constants.STEP_EVERYTHING);
            this.headerRenderer.updateFilterIcons();
            this.showLoadingPanel(false);
        }

        ensureNodeVisible(comparator: any) {
            if (this.doingVirtualPaging) {
                throw 'Cannot use ensureNodeVisible when doing virtual paging, as we cannot check rows that are not in memory';
            }
            // look for the node index we want to display
            var rowCount = this.rowModel.getVirtualRowCount();
            var comparatorIsAFunction = typeof comparator === 'function';
            var indexToSelect = -1;
            // go through all the nodes, find the one we want to show
            for (var i = 0; i < rowCount; i++) {
                var node = this.rowModel.getVirtualRow(i);
                if (comparatorIsAFunction) {
                    if (comparator(node)) {
                        indexToSelect = i;
                        break;
                    }
                } else {
                    // check object equality against node and data
                    if (comparator === node || comparator === node.data) {
                        indexToSelect = i;
                        break;
                    }
                }
            }
            if (indexToSelect >= 0) {
                this.gridPanel.ensureIndexVisible(indexToSelect);
            }
        }

        getFilterModel() {
            return this.filterManager.getFilterModel();
        }

        addApi() {
            var that = this;
            var api = {
                setDatasource: function (datasource: any) {
                    that.setDatasource(datasource);
                },
                onNewDatasource: function () {
                    that.setDatasource();
                },
                setRows: function (rows: any) {
                    that.setRows(rows);
                },
                onNewRows: function () {
                    that.setRows();
                },
                onNewCols: function () {
                    that.onNewCols();
                },
                unselectAll: function () {
                    console.error("unselectAll deprecated, call deselectAll instead");
                    this.deselectAll();
                },
                refreshView: function () {
                    that.rowRenderer.refreshView();
                },
                softRefreshView: function () {
                    that.rowRenderer.softRefreshView();
                },
                refreshGroupRows: function () {
                    that.rowRenderer.refreshGroupRows();
                },
                refreshHeader: function () {
                    // need to review this - the refreshHeader should also refresh all icons in the header
                    that.headerRenderer.refreshHeader();
                    that.headerRenderer.updateFilterIcons();
                },
                getModel: function () {
                    return that.rowModel;
                },
                onGroupExpandedOrCollapsed: function (refreshFromIndex: any) {
                    that.updateModelAndRefresh(constants.STEP_MAP, refreshFromIndex);
                },
                expandAll: function () {
                    that.inMemoryRowController.expandOrCollapseAll(true, null);
                    that.updateModelAndRefresh(constants.STEP_MAP);
                },
                collapseAll: function () {
                    that.inMemoryRowController.expandOrCollapseAll(false, null);
                    that.updateModelAndRefresh(constants.STEP_MAP);
                },
                addVirtualRowListener: function (rowIndex: any, callback: any) {
                    that.addVirtualRowListener(rowIndex, callback);
                },
                rowDataChanged: function (rows: any) {
                    that.rowRenderer.rowDataChanged(rows);
                },
                setQuickFilter: function (newFilter: any) {
                    that.onQuickFilterChanged(newFilter)
                },
                selectIndex: function (index: any, tryMulti: any, suppressEvents: any) {
                    that.selectionController.selectIndex(index, tryMulti, suppressEvents);
                },
                deselectIndex: function (index: any) {
                    that.selectionController.deselectIndex(index);
                },
                selectNode: function (node: any, tryMulti: any, suppressEvents: any) {
                    that.selectionController.selectNode(node, tryMulti, suppressEvents);
                },
                deselectNode: function (node: any) {
                    that.selectionController.deselectNode(node);
                },
                selectAll: function () {
                    that.selectionController.selectAll();
                    that.rowRenderer.refreshView();
                },
                deselectAll: function () {
                    that.selectionController.deselectAll();
                    that.rowRenderer.refreshView();
                },
                recomputeAggregates: function () {
                    that.inMemoryRowController.doAggregate();
                    that.rowRenderer.refreshGroupRows();
                },
                sizeColumnsToFit: function () {
                    if (that.gridOptionsWrapper.isDontUseScrolls()) {
                        console.warn('ag-grid: sizeColumnsToFit does not work when dontUseScrolls=true');
                        return;
                    }
                    var availableWidth = that.gridPanel.getWidthForSizeColsToFit();
                    that.columnController.sizeColumnsToFit(availableWidth);
                },
                showLoading: function (show: any) {
                    that.showLoadingPanel(show);
                },
                isNodeSelected: function (node: any) {
                    return that.selectionController.isNodeSelected(node);
                },
                getSelectedNodes: function () {
                    return that.selectionController.getSelectedNodes();
                },
                getBestCostNodeSelection: function () {
                    return that.selectionController.getBestCostNodeSelection();
                },
                ensureColIndexVisible: function (index: any) {
                    that.gridPanel.ensureColIndexVisible(index);
                },
                ensureIndexVisible: function (index: any) {
                    that.gridPanel.ensureIndexVisible(index);
                },
                ensureNodeVisible: function (comparator: any) {
                    that.ensureNodeVisible(comparator);
                },
                forEachInMemory: function (callback: any) {
                    that.rowModel.forEachInMemory(callback);
                },
                getFilterApiForColDef: function (colDef: any) {
                    console.warn('ag-grid API method getFilterApiForColDef deprecated, use getFilterApi instead');
                    return this.getFilterApi(colDef);
                },
                getFilterApi: function (key: any) {
                    var column = that.columnModel.getColumn(key);
                    return that.filterManager.getFilterApi(column);
                },
                getColumnDef: function (key: any) {
                    var column = that.columnModel.getColumn(key);
                    if (column) {
                        return column.colDef;
                    } else {
                        return null;
                    }
                },
                onFilterChanged: function () {
                    that.onFilterChanged();
                },
                setSortModel: function (sortModel: any) {
                    that.setSortModel(sortModel);
                },
                getSortModel: function () {
                    return that.getSortModel();
                },
                setFilterModel: function (model: any) {
                    that.filterManager.setFilterModel(model);
                },
                getFilterModel: function () {
                    return that.getFilterModel();
                },
                getFocusedCell: function () {
                    return that.rowRenderer.getFocusedCell();
                },
                setFocusedCell: function (rowIndex: any, colIndex: any) {
                    that.setFocusedCell(rowIndex, colIndex);
                },
                showToolPanel: function (show: any) {
                    that.showToolPanel(show);
                },
                isToolPanelShowing: function () {
                    return that.isToolPanelShowing();
                },
                hideColumn: function (colId: any, hide: any) {
                    that.columnController.hideColumns([colId], hide);
                },
                hideColumns: function (colIds: any, hide: any) {
                    that.columnController.hideColumns(colIds, hide);
                },
                getColumnState: function () {
                    return that.columnController.getState();
                },
                setColumnState: function (state: any) {
                    that.columnController.setState(state);
                    that.inMemoryRowController.doGrouping();
                    that.inMemoryRowController.updateModel(constants.STEP_EVERYTHING);
                    that.refreshHeaderAndBody();
                }
            };
            this.gridOptions.api = api;
        }

        setFocusedCell(rowIndex: any, colIndex: any) {
            this.gridPanel.ensureIndexVisible(rowIndex);
            this.gridPanel.ensureColIndexVisible(colIndex);
            var that = this;
            setTimeout(function () {
                that.rowRenderer.setFocusedCell(rowIndex, colIndex);
            }, 10);
        }

        getSortModel() {
            var allColumns = this.columnModel.getAllColumns();
            var columnsWithSorting = <any>[];
            var i: any;
            for (i = 0; i < allColumns.length; i++) {
                if (allColumns[i].sort) {
                    columnsWithSorting.push(allColumns[i]);
                }
            }
            columnsWithSorting.sort(function (a: any, b: any) {
                return a.sortedAt - b.sortedAt;
            });

            var result = <any>[];
            for (i = 0; i < columnsWithSorting.length; i++) {
                var resultEntry = {
                    field: columnsWithSorting[i].colDef.field,
                    sort: columnsWithSorting[i].sort
                };
                result.push(resultEntry);
            }

            return result;
        }

        setSortModel(sortModel: any) {
            if (!this.gridOptionsWrapper.isEnableSorting()) {
                console.warn('ag-grid: You are setting the sort model on a grid that does not have sorting enabled');
                return;
            }
            // first up, clear any previous sort
            var sortModelProvided = sortModel !== null && sortModel !== undefined && sortModel.length > 0;
            var allColumns = this.columnModel.getAllColumns();
            for (var i = 0; i < allColumns.length; i++) {
                var column = allColumns[i];

                var sortForCol: any = null;
                var sortedAt = -1;
                if (sortModelProvided && !column.colDef.suppressSorting) {
                    for (var j = 0; j < sortModel.length; j++) {
                        var sortModelEntry = sortModel[j];
                        if (typeof sortModelEntry.field === 'string'
                            && typeof column.colDef.field === 'string'
                            && sortModelEntry.field === column.colDef.field) {
                            sortForCol = sortModelEntry.sort;
                            sortedAt = j;
                        }
                    }
                }

                if (sortForCol) {
                    column.sort = sortForCol;
                    column.sortedAt = sortedAt;
                } else {
                    column.sort = null;
                    column.sortedAt = null;
                }
            }

            this.onSortingChanged();
        }

        onSortingChanged() {
            this.headerRenderer.updateSortIcons();
            if (this.gridOptionsWrapper.isEnableServerSideSorting()) {
                // if doing server side sorting, changing the sort has the impact
                // of resetting the datasource
                this.setDatasource();
            } else {
                // if doing in memory sorting, we just update the in memory data
                this.updateModelAndRefresh(constants.STEP_SORT);
            }
        }

        addVirtualRowListener(rowIndex: any, callback: any) {
            if (!this.virtualRowCallbacks[rowIndex]) {
                this.virtualRowCallbacks[rowIndex] = [];
            }
            this.virtualRowCallbacks[rowIndex].push(callback);
        }

        onVirtualRowSelected(rowIndex: any, selected: any) {
            // inform the callbacks of the event
            if (this.virtualRowCallbacks[rowIndex]) {
                this.virtualRowCallbacks[rowIndex].forEach(function (callback: any) {
                    if (typeof callback.rowRemoved === 'function') {
                        callback.rowSelected(selected);
                    }
                });
            }
        }

        onVirtualRowRemoved(rowIndex: any) {
            // inform the callbacks of the event
            if (this.virtualRowCallbacks[rowIndex]) {
                this.virtualRowCallbacks[rowIndex].forEach(function (callback: any) {
                    if (typeof callback.rowRemoved === 'function') {
                        callback.rowRemoved();
                    }
                });
            }
            // remove the callbacks
            delete this.virtualRowCallbacks[rowIndex];
        }

        onNewCols() {
            this.setupColumns();
            this.updateModelAndRefresh(constants.STEP_EVERYTHING);
        }

        updateBodyContainerWidthAfterColResize() {
            this.rowRenderer.setMainRowWidths();
            this.gridPanel.setBodyContainerWidth();
        }

        updatePinnedColContainerWidthAfterColResize() {
            this.gridPanel.setPinnedColContainerWidth();
        }

        doLayout() {
            // need to do layout first, as drawVirtualRows and setPinnedColHeight
            // need to know the result of the resizing of the panels.
            var sizeChanged = this.eRootPanel.doLayout();
            // both of the two below should be done in gridPanel, the gridPanel should register 'resize' to the panel
            if (sizeChanged) {
                this.rowRenderer.drawVirtualRows();
                this.gridPanel.setPinnedColHeight();
            }
        }
    }
}

