export {
	getDB,
	setActiveOfflineScope,
	cacheProducts,
	getCachedProducts,
	cacheBusiness,
	getCachedBusiness,
	cacheStore,
	getCachedStore,
	cacheCustomers,
	getCachedCustomers,
	cacheTills,
	getCachedTills,
	queueOfflineSale,
	getPendingSales,
	getReviewSales,
	getOfflineSale,
	updateOfflineSale,
	markSaleSynced,
	markSaleQueueStatus,
	removeSyncedSales,
	getSyncMeta,
	getLastSyncTime,
	hasCachedData,
	clearOfflineData,
	type OfflineProduct,
	type OfflineBusiness,
	type OfflineStore,
	type OfflineCustomer,
	type OfflineTill,
	type OfflineSale,
	type OfflineSaleLine,
	type OfflineSaleQueueStatus,
	type OfflineSaleCaptureInput,
} from './storage';

export {
	buildOfflineSaleCapture,
	queueCapturedOfflineSale,
	hydrateOfflineCaptureContext,
	rememberOfflineCaptureContext,
	peekOfflineCaptureContext,
	readPersistedCaptureFields,
	captureShiftStorageKey,
	captureCashierStorageKey,
} from './capture';

export {
	syncOfflineSales,
	getPendingSaleCount,
	refreshOfflineCache,
	setupNetworkListeners,
	setupAutoSync,
	isOnline,
	type SyncStatus,
	type SyncResult,
} from './sync';

export {
	useOfflinePos,
	type UseOfflinePosOptions,
	type UseOfflinePosResult,
} from './useOfflinePos';

