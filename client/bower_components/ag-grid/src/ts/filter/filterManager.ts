/// <reference path="../utils.ts" />
/// <reference path="textFilter.ts" />
/// <reference path="numberFilter.ts" />
/// <reference path="setFilter.ts" />
/// <reference path="../widgets/agPopupService.ts" />

module awk.grid {

    var agPopupService = PopupService.getInstance();
    var utils = Utils;

    export class FilterManager {

        $compile: any;
        $scope: any;
        gridOptionsWrapper: any;
        grid: any;
        allFilters: any;
        expressionService: any;
        columnModel: any;
        rowModel: any;

        init(grid: any, gridOptionsWrapper: any, $compile: any, $scope: any, expressionService: any, columnModel: any) {
            this.$compile = $compile;
            this.$scope = $scope;
            this.gridOptionsWrapper = gridOptionsWrapper;
            this.grid = grid;
            this.allFilters = {};
            this.expressionService = expressionService;
            this.columnModel = columnModel;
        }

        setFilterModel(model: any) {
            var that = this;
            if (model) {
                // mark the filters as we set them, so any active filters left over we stop
                var processedFields = Object.keys(model);
                utils.iterateObject(this.allFilters, function (key: any, filterWrapper: any) {
                    var field = filterWrapper.column.colDef.field;
                    utils.removeFromArray(processedFields, field);
                    if (field) {
                        var newModel = model[field];
                        that.setModelOnFilterWrapper(filterWrapper.filter, newModel);
                    } else {
                        console.warn('Warning ag-grid - no field found for column while doing setFilterModel');
                    }
                });
                // at this point, processedFields contains data for which we don't have a filter working yet
                utils.iterateArray(processedFields, function (field: any) {
                    var column = that.columnModel.getColumn(field);
                    if (!column) {
                        console.warn('Warning ag-grid - no column found for field ' + field);
                        return;
                    }
                    var filterWrapper = that.getOrCreateFilterWrapper(column);
                    that.setModelOnFilterWrapper(filterWrapper.filter, model[field]);
                });
            } else {
                utils.iterateObject(this.allFilters, function (key: any, filterWrapper: any) {
                    that.setModelOnFilterWrapper(filterWrapper.filter, null);
                });
            }
        }

        setModelOnFilterWrapper(filter: any, newModel: any) {
            // because user can provide filters, we provide useful error checking and messages
            if (typeof filter.getApi !== 'function') {
                console.warn('Warning ag-grid - filter missing getApi method, which is needed for getFilterModel');
                return;
            }
            var filterApi = filter.getApi();
            if (typeof filterApi.setModel !== 'function') {
                console.warn('Warning ag-grid - filter API missing setModel method, which is needed for setFilterModel');
                return;
            }
            filterApi.setModel(newModel);
        }

        getFilterModel() {
            var result = <any>{};
            utils.iterateObject(this.allFilters, function (key: any, filterWrapper: any) {
                // because user can provide filters, we provide useful error checking and messages
                if (typeof filterWrapper.filter.getApi !== 'function') {
                    console.warn('Warning ag-grid - filter missing getApi method, which is needed for getFilterModel');
                    return;
                }
                var filterApi = filterWrapper.filter.getApi();
                if (typeof filterApi.getModel !== 'function') {
                    console.warn('Warning ag-grid - filter API missing getModel method, which is needed for getFilterModel');
                    return;
                }
                var model = filterApi.getModel();
                if (model) {
                    var field = filterWrapper.column.colDef.field;
                    if (!field) {
                        console.warn('Warning ag-grid - cannot get filter model when no field value present for column');
                    } else {
                        result[field] = model;
                    }
                }
            });
            return result;
        }

        setRowModel(rowModel: any) {
            this.rowModel = rowModel;
        }

        // returns true if at least one filter is active
        isFilterPresent() {
            var atLeastOneActive = false;
            var that = this;

            var keys = Object.keys(this.allFilters);
            keys.forEach(function (key) {
                var filterWrapper = that.allFilters[key];
                if (!filterWrapper.filter.isFilterActive) { // because users can do custom filters, give nice error message
                    console.error('Filter is missing method isFilterActive');
                }
                if (filterWrapper.filter.isFilterActive()) {
                    atLeastOneActive = true;
                }
            });
            return atLeastOneActive;
        }

        // returns true if given col has a filter active
        isFilterPresentForCol(colId: any) {
            var filterWrapper = this.allFilters[colId];
            if (!filterWrapper) {
                return false;
            }
            if (!filterWrapper.filter.isFilterActive) { // because users can do custom filters, give nice error message
                console.error('Filter is missing method isFilterActive');
            }
            var filterPresent = filterWrapper.filter.isFilterActive();
            return filterPresent;
        }

        doesFilterPass(node: any) {
            var data = node.data;
            var colKeys = Object.keys(this.allFilters);
            for (var i = 0, l = colKeys.length; i < l; i++) { // critical code, don't use functional programming

                var colId = colKeys[i];
                var filterWrapper = this.allFilters[colId];

                // if no filter, always pass
                if (filterWrapper === undefined) {
                    continue;
                }

                if (!filterWrapper.filter.doesFilterPass) { // because users can do custom filters, give nice error message
                    console.error('Filter is missing method doesFilterPass');
                }
                var params = {
                    node: node,
                    data: data
                };
                if (!filterWrapper.filter.doesFilterPass(params)) {
                    return false;
                }
            }
            // all filters passed
            return true;
        }

        onNewRowsLoaded() {
            var that = this;
            Object.keys(this.allFilters).forEach(function (field) {
                var filter = that.allFilters[field].filter;
                if (filter.onNewRowsLoaded) {
                    filter.onNewRowsLoaded();
                }
            });
        }

        createValueGetter(colDef: any) {
            var that = this;
            return function valueGetter(node: any) {
                var api = that.gridOptionsWrapper.getApi();
                var context = that.gridOptionsWrapper.getContext();
                return utils.getValue(that.expressionService, node.data, colDef, node, api, context);
            };
        }

        getFilterApi(column: any) {
            var filterWrapper = this.getOrCreateFilterWrapper(column);
            if (filterWrapper) {
                if (typeof filterWrapper.filter.getApi === 'function') {
                    return filterWrapper.filter.getApi();
                }
            }
        }

        getOrCreateFilterWrapper(column: any) {
            var filterWrapper = this.allFilters[column.colId];

            if (!filterWrapper) {
                filterWrapper = this.createFilterWrapper(column);
                this.allFilters[column.colId] = filterWrapper;
            }

            return filterWrapper;
        }

        createFilterWrapper(column: any) {
            var colDef = column.colDef;

            var filterWrapper = {
                column: column,
                filter: <any> null,
                scope: <any> null,
                gui: <any> null
            };
            var filterChangedCallback = this.grid.onFilterChanged.bind(this.grid);
            var filterParams = colDef.filterParams;
            var params = {
                colDef: colDef,
                rowModel: this.rowModel,
                filterChangedCallback: filterChangedCallback,
                filterParams: filterParams,
                localeTextFunc: this.gridOptionsWrapper.getLocaleTextFunc(),
                valueGetter: this.createValueGetter(colDef),
                $scope: <any> null
            };
            if (typeof colDef.filter === 'function') {
                // if user provided a filter, just use it
                // first up, create child scope if needed
                if (this.gridOptionsWrapper.isAngularCompileFilters()) {
                    var scope = this.$scope.$new();
                    filterWrapper.scope = scope;
                    params.$scope = scope;
                }
                // now create filter
                filterWrapper.filter = new colDef.filter(params);
            } else if (colDef.filter === 'text') {
                filterWrapper.filter = new TextFilter(params);
            } else if (colDef.filter === 'number') {
                filterWrapper.filter = new NumberFilter(params);
            } else {
                filterWrapper.filter = new SetFilter(params);
            }

            if (!filterWrapper.filter.getGui) { // because users can do custom filters, give nice error message
                throw 'Filter is missing method getGui';
            }

            var eFilterGui = document.createElement('div');
            eFilterGui.className = 'ag-filter';
            var guiFromFilter = filterWrapper.filter.getGui();
            if (utils.isNodeOrElement(guiFromFilter)) {
                //a dom node or element was returned, so add child
                eFilterGui.appendChild(guiFromFilter);
            } else {
                //otherwise assume it was html, so just insert
                var eTextSpan = document.createElement('span');
                eTextSpan.innerHTML = guiFromFilter;
                eFilterGui.appendChild(eTextSpan);
            }

            if (filterWrapper.scope) {
                filterWrapper.gui = this.$compile(eFilterGui)(filterWrapper.scope)[0];
            } else {
                filterWrapper.gui = eFilterGui;
            }

            return filterWrapper;
        }

        showFilter(column: any, eventSource: any) {

            var filterWrapper = this.getOrCreateFilterWrapper(column);

            agPopupService.positionPopup(eventSource, filterWrapper.gui, 200);
            agPopupService.addAsModalPopup(filterWrapper.gui);

            if (filterWrapper.filter.afterGuiAttached) {
                filterWrapper.filter.afterGuiAttached();
            }
        }
    }
}

