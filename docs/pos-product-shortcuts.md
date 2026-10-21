# Branch product shortcuts

In Sell → POS, Product shortcuts sits below scan/search. Owners and managers use Manage shortcuts to create named screens (for example Main and Stationery), search the active catalogue, add products, and move buttons up/down. Save publishes the complete layout to this branch; Cancel discards edits. Each layout supports 12 screens and 40 buttons per screen. Other tills receive changes on reload or reconnection.

Cashiers can use saved screens but cannot change them. A tap uses the existing cart stock checks and checkout prices. Multiple-unit products open the existing selling-unit picker. Out-of-stock or unavailable products cannot be added. Buttons store product IDs, never fixed prices or copied stock quantities. The layout is shared by the branch rather than by a particular cashier or browser.

The browser retains only the last confirmed branch layout for offline use. Offline buttons require the product to be present in the normal device catalogue; a saved button cannot manufacture missing catalogue records or expand the offline catalogue limit. Editing requires a successful online load. Scan/search remains available if shortcut loading fails. Read errors and offline status are visible.

Server saves require OWNER/MANAGER, billing write access and the authoritative selected branch. Product IDs must belong to the business and remain active. A compare-and-swap against the loaded layout rejects stale edits rather than overwriting changes from another till. Settings changes record a branch-scoped audit event. The read endpoint authenticates and tenant-scopes branch, active products and stock, and returns no cost metadata.

Migration `20261021160000_pos_shortcut_screens` adds nullable `Store.posShortcutsJson`. Existing branches start with no configured screens. Preview only; production migration/release remains subject to the owner's release decision.
