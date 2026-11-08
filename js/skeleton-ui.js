/**
 * ==============================================================================
 * WASEET PLATFORM - SKELETON LOADING & SHIMMER UI ENGINE
 * Location: D:\waseet-app\js\skeleton-ui.js
 * 
 * Generates realistic dark-mode shimmer skeletons for:
 * 1. Marketplace Account Cards (index.html, deals.html, my-accounts.html)
 * 2. Pending Accounts Review (pending-accounts.html)
 * 3. Regional Brokers (admin-brokers.html & Store Broker Drawer)
 * 4. Financial Records & Tables (admin-deposits.html, admin-withdrawals.html, wallet.html)
 * 5. Support & Administrative Chats (contact-support.html, admin-chats.html)
 * ==============================================================================
 */

(function (window) {
    'use strict';

    const WaseetSkeleton = {
        /**
         * Marketplace / Deals Account Cards Grid
         */
        getMarketplaceCards(count = 6) {
            let html = '';
            for (let i = 0; i < count; i++) {
                html += `
                    <div class="skeleton-marketplace-card">
                        <div class="skeleton-shimmer skeleton-card-thumb"></div>
                        <div class="skeleton-card-body">
                            <div class="skeleton-shimmer skeleton-badge" style="width: 80px; height: 20px;"></div>
                            <div class="skeleton-shimmer skeleton-text heading"></div>
                            <div class="skeleton-shimmer skeleton-text medium"></div>
                            <div class="skeleton-card-tags">
                                <div class="skeleton-shimmer skeleton-badge" style="width: 60px; height: 18px;"></div>
                                <div class="skeleton-shimmer skeleton-badge" style="width: 70px; height: 18px;"></div>
                                <div class="skeleton-shimmer skeleton-badge" style="width: 50px; height: 18px;"></div>
                            </div>
                        </div>
                        <div class="skeleton-card-footer">
                            <div style="display: flex; flex-direction: column; gap: 4px; width: 40%;">
                                <div class="skeleton-shimmer skeleton-text" style="width: 50px; height: 10px; margin: 0;"></div>
                                <div class="skeleton-shimmer skeleton-text" style="width: 80px; height: 18px; margin: 0;"></div>
                            </div>
                            <div class="skeleton-shimmer skeleton-btn" style="width: 100px; height: 36px; border-radius: 8px;"></div>
                        </div>
                    </div>
                `;
            }
            return html;
        },

        /**
         * Pending Accounts for Inspection & Review (Replica of pending-accounts.html cards)
         */
        getPendingAccountsList(count = 3) {
            let html = '';
            for (let i = 0; i < count; i++) {
                html += `
                    <div class="skeleton-pending-card">
                        <div class="skeleton-pending-header">
                            <div style="display: flex; align-items: center; gap: 12px; width: 60%;">
                                <div class="skeleton-shimmer skeleton-avatar sm"></div>
                                <div style="display: flex; flex-direction: column; gap: 6px; width: 70%;">
                                    <div class="skeleton-shimmer skeleton-text heading" style="margin: 0; width: 50%;"></div>
                                    <div class="skeleton-shimmer skeleton-text short" style="margin: 0;"></div>
                                </div>
                            </div>
                            <div class="skeleton-shimmer skeleton-badge" style="width: 110px; height: 26px;"></div>
                        </div>
                        <div class="skeleton-pending-body">
                            <div class="skeleton-shimmer skeleton-pending-preview"></div>
                            <div class="skeleton-pending-details">
                                <div class="skeleton-shimmer skeleton-text heading" style="width: 75%;"></div>
                                <div class="skeleton-shimmer skeleton-text long"></div>
                                <div class="skeleton-shimmer skeleton-text medium"></div>
                                <div style="display: flex; gap: 10px; margin-top: 10px;">
                                    <div class="skeleton-shimmer skeleton-badge" style="width: 90px; height: 28px;"></div>
                                    <div class="skeleton-shimmer skeleton-badge" style="width: 90px; height: 28px;"></div>
                                    <div class="skeleton-shimmer skeleton-badge" style="width: 90px; height: 28px;"></div>
                                </div>
                            </div>
                        </div>
                        <div class="skeleton-pending-actions">
                            <div class="skeleton-shimmer skeleton-btn" style="width: 120px; height: 38px;"></div>
                            <div class="skeleton-shimmer skeleton-btn" style="width: 120px; height: 38px;"></div>
                        </div>
                    </div>
                `;
            }
            return html;
        },

        /**
         * Regional Brokers List (admin-brokers.html & Store Broker Drawer)
         */
        getBrokersList(count = 4) {
            let html = '';
            for (let i = 0; i < count; i++) {
                html += `
                    <div class="skeleton-broker-card">
                        <div class="skeleton-broker-left">
                            <div class="skeleton-shimmer skeleton-avatar lg"></div>
                            <div style="display: flex; flex-direction: column; gap: 8px; width: 60%;">
                                <div class="skeleton-shimmer skeleton-text heading" style="margin: 0; width: 55%;"></div>
                                <div class="skeleton-shimmer skeleton-text short" style="margin: 0;"></div>
                                <div style="display: flex; gap: 6px;">
                                    <div class="skeleton-shimmer skeleton-badge" style="width: 60px; height: 18px;"></div>
                                    <div class="skeleton-shimmer skeleton-badge" style="width: 70px; height: 18px;"></div>
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="skeleton-shimmer skeleton-btn" style="width: 95px; height: 36px; border-radius: 8px;"></div>
                            <div class="skeleton-shimmer skeleton-btn" style="width: 95px; height: 36px; border-radius: 8px;"></div>
                        </div>
                    </div>
                `;
            }
            return html;
        },

        /**
         * Table Rows for Financial Operations (Deposits, Withdrawals, Deals)
         */
        getTableRows(count = 5) {
            let html = '';
            for (let i = 0; i < count; i++) {
                html += `
                    <div class="skeleton-table-row">
                        <div style="display: flex; align-items: center; gap: 12px; width: 35%;">
                            <div class="skeleton-shimmer skeleton-avatar sm"></div>
                            <div style="display: flex; flex-direction: column; gap: 5px; width: 70%;">
                                <div class="skeleton-shimmer skeleton-text" style="height: 14px; width: 80%; margin: 0;"></div>
                                <div class="skeleton-shimmer skeleton-text" style="height: 10px; width: 45%; margin: 0;"></div>
                            </div>
                        </div>
                        <div class="skeleton-shimmer skeleton-badge" style="width: 85px; height: 24px;"></div>
                        <div class="skeleton-shimmer skeleton-text" style="width: 90px; height: 16px; margin: 0;"></div>
                        <div class="skeleton-shimmer skeleton-badge" style="width: 75px; height: 24px;"></div>
                        <div class="skeleton-shimmer skeleton-btn" style="width: 80px; height: 32px; border-radius: 6px;"></div>
                    </div>
                `;
            }
            return html;
        },

        /**
         * Support & Admin Chat Conversations List
         */
        getChatsList(count = 5) {
            let html = '';
            for (let i = 0; i < count; i++) {
                html += `
                    <div class="skeleton-chat-item">
                        <div class="skeleton-shimmer skeleton-avatar"></div>
                        <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div class="skeleton-shimmer skeleton-text" style="width: 40%; height: 14px; margin: 0;"></div>
                                <div class="skeleton-shimmer skeleton-text" style="width: 15%; height: 10px; margin: 0;"></div>
                            </div>
                            <div class="skeleton-shimmer skeleton-text" style="width: 75%; height: 11px; margin: 0;"></div>
                        </div>
                    </div>
                `;
            }
            return html;
        },

        /**
         * Dashboard Stat Counters
         */
        getStatsGrid(count = 4) {
            let html = '';
            for (let i = 0; i < count; i++) {
                html += `
                    <div style="background: rgba(20, 26, 42, 0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; gap: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div class="skeleton-shimmer skeleton-text" style="width: 50%; height: 12px; margin: 0;"></div>
                            <div class="skeleton-shimmer skeleton-avatar sm" style="border-radius: 8px;"></div>
                        </div>
                        <div class="skeleton-shimmer skeleton-text" style="width: 40%; height: 28px; margin: 0;"></div>
                    </div>
                `;
            }
            return html;
        }
    };

    window.WaseetSkeleton = WaseetSkeleton;

})(window);
