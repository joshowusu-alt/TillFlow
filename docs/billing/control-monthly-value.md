# Control subscription monthly value

New subscription writes save pesewas in `monthlyValueMinorUnits` and retain the whole-cedi value in the legacy `monthlyValuePence` column for older app versions. Existing rows retain their original values. A null minor-unit value means the row predates dual writing. Readers can use the legacy cedi amount until the subscription is next saved. Apply the TillFlow schema migration to the shared control database before deploying either writer.
