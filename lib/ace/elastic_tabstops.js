/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2012, Ajax.org B.V.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */

define(function(require, exports, module) {
"use strict";

var ElasticTabstops = function(editor, session) {
    this.$editor = editor;
    this.$session = session;
};

(function() {
    this.processRow = function(rows) {
        this.$inChange = true;
        var checkedRows = [];

        for (var r = 0, rowCount = rows.length; r < rowCount; r++) {
            var row = rows[r];

            if (checkedRows.indexOf(row) > -1)
                continue;

            var cellWidthObj = this.$findCellWidthsForBlock(row);
            var cellWidths = this.$setBlockCellWidthsToMax(cellWidthObj.cellWidths);
            var rowIndex = cellWidthObj.firstRow;

            for (var w = 0, l = cellWidths.length; w < l; w++) {
                var widths = cellWidths[w];
                checkedRows.push(rowIndex);
                this.$adjustRow(rowIndex, widths);
                rowIndex++;
            }
        }
        this.$inChange = false;
    };

    this.$findCellWidthsForBlock = function(row) {
        var cellWidths = [], widths;

        // starting row and backward
        var rowIter = row;
        while (rowIter >= 0) {
            widths = this.$cellWidthsForRow(rowIter);
            if (widths.length == 0)
                break;

            cellWidths.unshift(widths);
            rowIter--;
        }
        var firstRow = rowIter + 1;

        // forward (not including starting row)
        rowIter = row;
        var numRows = this.$session.getLength();

        while (rowIter < numRows - 1) {
            rowIter++;

            widths = this.$cellWidthsForRow(rowIter);
            if (widths.length == 0)
                break;

            cellWidths.push(widths);
        }

        return { cellWidths: cellWidths, firstRow: firstRow };
    };

    this.$cellWidthsForRow = function(row) {
        var selectionColumns = this.$selectionColumnsForRow(row);
        // todo: support multicursor

        var tabs = [-1].concat(this.$tabsForRow(row));
        var widths = tabs.map(function (el) { return 0; } ).slice(1);
        var line = this.$session.getLine(row);

        for (var i = 0, len = tabs.length - 1; i < len; i++) {
            var leftEdge = tabs[i]+1;
            var rightEdge = tabs[i+1];

            var rightmostSelection = this.$rightmostSelectionInCell(selectionColumns, rightEdge);
            var cell = line.substring(leftEdge, rightEdge);
            widths[i] = Math.max(cell.replace(/\s+$/g,'').length, rightmostSelection - leftEdge);
        }
        
        return widths;
    };

    this.$selectionColumnsForRow = function(row) {
        var selections = [], cursor = this.$editor.getCursorPosition();
        if (this.$session.getSelection().isEmpty()) {
            // todo: support multicursor
            if (row == cursor.row)
                selections.push(cursor.column);   
        }

        return selections;
    };

    this.$setBlockCellWidthsToMax = function(cellWidths) {
        var startingNewBlock = true, blockStartRow, blockEndRow, maxWidth;

        var columnInfo = this.$izip_longest(cellWidths);

        for (var c = 0, l = columnInfo.length; c < l; c++) {
            var column = columnInfo[c];
            // add an extra None to the end so that the end of the column automatically
            // finishes a block
            column.push(NaN);

            for (var r = 0, s = column.length; r < s; r++) {
                var width = column[r];
                if (startingNewBlock) {
                    blockStartRow = r;
                    maxWidth = 0;
                    startingNewBlock = false;
                }
                if (isNaN(width)) {
                    // block ended
                    blockEndRow = r;

                    for (var j = blockStartRow; j < blockEndRow; j++) {
                        cellWidths[j][c] = maxWidth;
                    }
                    startingNewBlock = true;
                }

                maxWidth = Math.max(maxWidth, width);
            }
        }

        return cellWidths;
    };

    this.$rightmostSelectionInCell = function(selectionColumns, cellRightEdge) {
        var rightmost = 0;

        if (selectionColumns.length) {
            var lengths = [];
            for (var s = 0, length = selectionColumns.length; s < length; s++) {
                if (selectionColumns[s] <= cellRightEdge)
                    lengths.push(s);
                else 
                    lengths.push(0);
            }
            rightmost = Math.max.apply(Math, lengths);
        }

        return rightmost;
    };

    this.$tabsForRow = function(row) {
        var rowTabs = [], line = this.$session.getLine(row),
            re = /\t/g, match;

        while ((match = re.exec(line)) != null) {
            rowTabs.push(match.index);
        }

        return rowTabs;
    };

    this.$adjustRow = function(row, widths) {
        var rowTabs = this.$tabsForRow(row);

        if (rowTabs.length == 0)
            return;
        
        var bias = 0, location = -1;
        
        // this always only contains two elements, so we're safe in the loop below
        var expandedSet = this.$izip(widths, rowTabs);

        for (var i = 0, l = expandedSet.length; i < l; i++) {
            var w = expandedSet[i][0], it = expandedSet[i][1];
            location += 1 + w;
            it += bias;
            var difference = location - it;

            if (difference == 0)
                continue;

            var partialLine = this.$session.getLine(row).substr(0, it );
            var strippedPartialLine = partialLine.replace(/\s*$/g, "");
            var ispaces = partialLine.length - strippedPartialLine.length;

            if (difference > 0) {
                // put the spaces after the tab and then delete the tab, so any insertion
                // points behave as expected
                this.$session.getDocument().insertInLine({row: row, column: it + 1}, Array(difference + 1).join(" ") + "\t");
                this.$session.getDocument().removeInLine(row, it, it + 1);

                bias += difference;
            }

            if (difference < 0 && ispaces >= -difference) {
                this.$session.getDocument().removeInLine(row, it + difference, it);
                bias += difference;
            }
        }
    };

    // the is a (naive) Python port--but works for these purposes
    this.$izip_longest = function(iterables) {
        var longest = iterables[0].length;
        var iterablesLength = iterables.length;

        for (var i = 1; i < iterablesLength; i++) {
            var iLength = iterables[i].length;
            if (iLength > longest)
                longest = iLength;
        }
        
        var expandedSet = [];

        for (var l = 0; l < longest; l++) {
            var set = [];
            for (var i = 0; i < iterablesLength; i++) {
                if (iterables[i][l] === "")
                    set.push(NaN);
                else
                    set.push(iterables[i][l]);
            }

            expandedSet.push(set);
        }
        

        return expandedSet;
    };

    // an even more (naive) Python port
    this.$izip = function(widths, tabs) {
        // grab the shorter size
        var size = widths.length >= tabs.length ? tabs.length : widths.length;
        
        var expandedSet = [];
        for (var i = 0; i < size; i++) {
            var set = [ widths[i], tabs[i] ];
            expandedSet.push(set);
        }
        return expandedSet;
    };

}).call(ElasticTabstops.prototype);

exports.ElasticTabstops = ElasticTabstops;

});