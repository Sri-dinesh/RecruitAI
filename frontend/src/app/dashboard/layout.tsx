'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { RecruitmentProvider } from '@/context/RecruitmentContext';
import AppSidebar from '@/components/layout/AppSidebar';
import AppHeader from '@/components/layout/AppHeader';
import ProfileModal from '@/components/ProfileModal';
import CandidateDrawer from '@/components/candidates/CandidateDrawer';

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileModalTab, setProfileModalTab] = useState<'profile' | 'preferences' | 'security'>('profile');
  const pathname = usePathname();
  const isCopilot = pathname === '/dashboard/copilot';

  const handleOpenSettings = () => {
    setProfileModalTab('preferences');
    setIsProfileModalOpen(true);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 font-sans">
      {/* Collapsible Left Navigation Sidebar */}
      <AppSidebar 
        onOpenSettings={handleOpenSettings}
        isOpenMobile={isOpenMobile}
        onCloseMobile={() => setIsOpenMobile(false)}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Sticky Top Header */}
        <AppHeader 
          onOpenMobileMenu={() => setIsOpenMobile(true)}
          onOpenSettings={handleOpenSettings}
        />

        {/* Page Content Area */}
        {isCopilot ? (
          <main className="flex-1 overflow-hidden bg-slate-50/50 flex flex-col min-h-0 relative">
            {children}
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto bg-slate-50/70 p-4 sm:p-6 lg:p-8 custom-scrollbar">
            <div className="max-w-7xl mx-auto w-full">
              {children}
            </div>
          </main>
        )}
      </div>

      {/* Slide-out Candidate Inspector Drawer */}
      <CandidateDrawer />

      {/* Profile & Recruiter Preferences Modal */}
      <ProfileModal 
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        initialTab={profileModalTab}
      />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RecruitmentProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </RecruitmentProvider>
  );
}
