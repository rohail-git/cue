import {
  Bell,
  BookOpen,
  Calendar,
  ChevronLeft,
  Gamepad2,
  ListFilter,
  NotebookText,
  Search,
  Settings,
  Tv,
} from 'lucide-react';
import { useCueStore } from '../store/useCueStore';
import { CueWordmark } from './CueLogo';

export function NavChrome() {
  const {
    state,
    route,
    canGoBack,
    switchTab,
    goBack,
    toggleCalendarMode,
    setFilterSheetOpen,
    setNotificationsOpen,
    setSettingsOpen,
  } = useCueStore();

  const unreadCount = state.notifications.filter((n) => !n.read).length;

  const activeMainTab =
    route.view === 'watch' || route.view === 'library-watch'
      ? 'watch'
      : route.view === 'read' || route.view === 'library-read'
        ? 'read'
        : route.view === 'play' || route.view === 'library-play'
          ? 'play'
          : route.view === 'journal'
            ? 'journal'
            : route.view === 'search'
              ? 'search'
              : null;

  const isDomainTab =
    route.view === 'watch' || route.view === 'read' || route.view === 'play';
  const isJournal = route.view === 'journal';
  const isCalendarActive = isDomainTab && Boolean(route.calendarMode);

  const showMobileBottomNav =
    route.view === 'watch' ||
    route.view === 'read' ||
    route.view === 'play' ||
    route.view === 'journal' ||
    route.view === 'search';

  const renderLeftDesktopAction = () => {
    if (canGoBack && !isDomainTab && !isJournal && route.view !== 'search') {
      return (
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          className="glass-btn h-11 w-11 rounded-full flex items-center justify-center text-ink hover:scale-105 active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      );
    }
    if (isDomainTab) {
      return (
        <button
          type="button"
          onClick={() => setFilterSheetOpen(true)}
          aria-label="Filter and sort"
          className="glass-btn h-11 w-11 rounded-full flex items-center justify-center text-ink hover:scale-105 active:scale-95 transition-transform"
        >
          <ListFilter className="w-4 h-4" />
        </button>
      );
    }
    if (isJournal) {
      return (
        <button
          type="button"
          onClick={() => setNotificationsOpen(true)}
          aria-label="Release alerts"
          className="glass-btn relative h-11 w-11 rounded-full flex items-center justify-center text-ink hover:scale-105 active:scale-95 transition-transform"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-brand ring-2 ring-[#1c1a1a]" />
          )}
        </button>
      );
    }
    return <div className="w-11" />;
  };

  const renderRightDesktopAction = () => {
    if (isDomainTab) {
      return (
        <button
          type="button"
          onClick={toggleCalendarMode}
          aria-label="Toggle release calendar"
          title="Upcoming releases"
          className={`glass-btn h-11 w-11 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
            isCalendarActive ? 'text-brand border-brand/50 bg-brand/15' : 'text-ink'
          }`}
        >
          <Calendar className="w-4 h-4" />
        </button>
      );
    }
    if (isJournal) {
      return (
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="glass-btn h-11 w-11 rounded-full flex items-center justify-center text-ink hover:scale-105 active:scale-95 transition-transform"
        >
          <Settings className="w-4 h-4" />
        </button>
      );
    }
    return <div className="w-11" />;
  };

  const navItems = [
    { id: 'watch' as const, label: 'Watch', Icon: Tv },
    { id: 'read' as const, label: 'Read', Icon: BookOpen },
    { id: 'play' as const, label: 'Play', Icon: Gamepad2 },
    { id: 'journal' as const, label: 'Journal', Icon: NotebookText },
  ];

  return (
    <>
      {/* Desktop / Tablet Top Floating Chrome */}
      <header className="hidden md:flex fixed top-0 inset-x-0 z-40 pointer-events-none px-6 lg:px-10 pt-4 items-center justify-between">
        <div className="pointer-events-auto flex items-center gap-3.5">
          {renderLeftDesktopAction()}
          <button
            type="button"
            onClick={() => switchTab('watch', false)}
            className="hidden lg:inline-flex items-center px-2 py-1 rounded-lg hover:opacity-85 transition-opacity"
            aria-label="cue home"
          >
            <CueWordmark className="text-[22px]" />
          </button>
        </div>

        <nav
          aria-label="Primary navigation"
          className="pointer-events-auto glass-pill rounded-full p-1.5 flex items-center gap-1"
        >
          {navItems.map(({ id, label, Icon }) => {
            const active = activeMainTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => switchTab(id, false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  active
                    ? 'bg-white/10 text-brand'
                    : 'text-ink/85 hover:text-ink hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => switchTab('search')}
            aria-label="Search"
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all ${
              activeMainTab === 'search'
                ? 'bg-white/10 text-brand'
                : 'text-ink/85 hover:text-ink hover:bg-white/5'
            }`}
          >
            <Search className="w-4 h-4" />
          </button>
        </nav>

        <div className="pointer-events-auto flex items-center gap-3">
          {renderRightDesktopAction()}
        </div>
      </header>

      {/* Mobile Bottom Floating Liquid Glass Pill (Watch, Read, Play, Journal) + Detached Search Circle */}
      {showMobileBottomNav && (
        <nav
          aria-label="Mobile navigation"
          className="md:hidden fixed bottom-0 inset-x-0 z-40 pointer-events-none px-3.5 pb-5 pt-2 flex items-center justify-center gap-2.5"
        >
          <div className="pointer-events-auto glass-pill rounded-full p-1 flex items-center flex-1 max-w-[308px] justify-between">
            {navItems.map(({ id, label, Icon }) => {
              const active = activeMainTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => switchTab(id, false)}
                  className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1.5 px-1.5 rounded-full transition-all ${
                    active ? 'bg-white/10 text-brand' : 'text-ink/85 hover:text-ink'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] mb-0.5" />
                  <span className="text-[10.5px] font-medium leading-none truncate">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => switchTab('search')}
            aria-label="Search catalog"
            className={`pointer-events-auto glass-pill h-[52px] w-[52px] rounded-full flex items-center justify-center shrink-0 transition-all active:scale-95 ${
              activeMainTab === 'search' ? 'text-brand border-brand/50' : 'text-ink'
            }`}
          >
            <Search className="w-[19px] h-[19px]" />
          </button>
        </nav>
      )}
    </>
  );
}
