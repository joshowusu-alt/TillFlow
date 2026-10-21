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

## Classification setup

Stock → Products now has Products and Classification tabs. Classification uses
three clearly labelled category/division/group columns with a separate add action
at each level. A selected category limits divisions; a selected division limits
groups. The selected path links directly to the matching product list.

Creation uses the selected parent. Successful saves navigate back to the saved
category/division/group using setup-specific URL parameters and open the next
editor. These parameters do not filter the Products tab's count. Server redirects
derive division/group ancestry from tenant-scoped database records. This retains
the next step when cache revalidation remounts the client form. Category colour,
image and sort-order creation plus category removal remain in collapsed sections.

Each setup column includes case-insensitive name search and a fixed-height scroll
area. Five choices render initially (the selected match comes first); Show more
adds twenty, and Show fewer restores five. Search never changes the selected
classification, which stays labelled above the results even when filtered out.
Changing category/division clears stale child searches. Tests exercise 1,000
entries per level, the final result, empty matches and rendering limits.
