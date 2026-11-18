import { useState } from 'react';
import { Bell, CheckCheck, ChevronDown, ChevronUp, Mail, MessageSquare, X } from 'lucide-react';
import type { NotificationItem } from '../types';
import { formatDateTime } from '../utils/format';

interface Props {
  open: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onNavigate?: (linkPath: string) => void;
}

export function NotificationCenter({
  open,
  onClose,
  notifications,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!open) return null;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[1px]">
      <div
        className="w-full max-w-lg bg-white h-full border-l border-slate-200 flex flex-col shadow-xl"
        role="dialog"
        aria-label="Notification Center"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Notifications & Dispatched Alerts
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {unreadCount} unread · {notifications.length} total alerts
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 hover:bg-teal-50 rounded-md transition-colors whitespace-nowrap"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors"
              aria-label="Close notification center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <div className="p-10 text-center">
              <Bell className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700">No notifications yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Status updates, match discoveries, and email dispatch logs will appear here.
              </p>
            </div>
          ) : (
            notifications.map((n) => {
              const isExpanded = expandedId === n.id;
              return (
                <div
                  key={n.id}
                  className={`p-5 transition-colors ${n.is_read ? 'bg-white' : 'bg-teal-50/40'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                        <span className="font-medium text-slate-700 capitalize">
                          {n.category.replace(/_/g, ' ')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{formatDateTime(n.created_at)}</span>
                        {!n.is_read && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-teal-700">Unread</span>
                          </>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900">{n.title}</h3>
                      <p className="text-sm text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                    {!n.is_read && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(n.id)}
                        className="font-medium text-slate-700 hover:text-slate-900 underline underline-offset-2"
                      >
                        Mark as read
                      </button>
                    )}
                    {onNavigate && n.link_path && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!n.is_read) onMarkRead(n.id);
                          onNavigate(n.link_path);
                          onClose();
                        }}
                        className="font-medium text-teal-700 hover:text-teal-900 underline underline-offset-2"
                      >
                        Open section
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : n.id)}
                      className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800 ml-auto"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {isExpanded ? 'Hide Email / SMS Log' : 'Inspect Email / SMS Log'}
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-200 text-xs space-y-2.5 text-slate-600">
                      <div>
                        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-teal-700" />
                          Dispatched Email (Privacy-Masked)
                        </div>
                        <p className="mt-1 font-medium text-slate-800">
                          Subject: {n.email_subject}
                        </p>
                        <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-200">
                          {n.email_body}
                        </pre>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-amber-700" />
                          Simulated SMS Gateway Log
                        </div>
                        <p className="mt-1 font-mono text-[11px] bg-slate-50 p-2 rounded border border-slate-200 text-slate-700">
                          {n.sms_simulated_text}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
