# Cascading catalogue navigation

Preview-only UI change. Product assignment already uses Category → Division → Group;
the saved group determines its category through its parent division. No schema or
classification-data migration is required.

Products now has three cascading navigation levels. Category links clear division,
group and pagination; division links clear group and pagination; group links include
the full ancestry. Search and stock-review context survive the navigation. The URL
is authoritative, supporting normal browser back/forward and links into a group.
Unknown or conflicting URL filters remain restricted by the product query and show
an unavailable-path message with a clear link; they never silently widen the list.

Counts are aggregated by category/group across this business and the current search
or issue scope, independent of the currently selected descendants and displayed
page. They count product records, not units on hand. Category-only and uncategorised
products remain included at their appropriate levels. No inventory quantities or
costs are fetched for this navigation.

Product cards and the desktop Classification column show the group first, with its
category and division beneath. Category-only and uncategorised products remain
explicit. Saved list state includes category, division and group as well as search.

Verification covers ancestry validation, parent resets, count totals, preserved
search/issue context, category-only shops, and list state. The local owner browser
walkthrough exercises actual URL navigation and database counts at 320/390/1280px.
