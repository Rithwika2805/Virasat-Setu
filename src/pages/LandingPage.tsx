import React, { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, ShieldCheck, Building2, Users, CheckCircle2 } from 'lucide-react';
import { BrandMark } from '../components/BrandMark';
import { apiRequest } from '../services/api';

interface Props {
  onNavigateAuth: (mode?: 'login' | 'register') => void;
  onEnterPortal?: () => void;
  isAuthenticated: boolean;
}

const FAQS = [
  {
    q: 'Does Virasat Setu hold or transfer my family’s money?',
    a: 'No. Virasat Setu acts purely as a secure discovery and coordination bridge. Financial institutions retain complete custody of customer funds, verify nominee or legal heir documentation independently, and process payouts directly.',
  },
  {
    q: 'Does Virasat Setu directly access every bank’s private customer database?',
    a: 'No. In production digital public infrastructure, participating institutions receive verified death notification triggers and run checks within their own boundaries, returning only potential candidate match signals. In this prototype, simulated institutional datasets model that federated query.',
  },
  {
    q: 'How does the automated matching score work?',
    a: 'Once an administrator verifies a death certificate record, the matching engine evaluates four weighted parameters: Exact Sample Identity Reference (50 points), Name Similarity (up to 25 points), Exact Date of Birth (15 points), and City/Branch or Nominee Reference alignment (10 points). Scores of 80–100 indicate a Strong Potential Match, 60–79 Require Manual Review, and scores below 60 generate no match.',
  },
  {
    q: 'Is a discovered match proof of legal ownership?',
    a: 'No. A match score identifies a potential asset candidate only. Establishing the legal right to claim requires separate Claimant / Nominee / Legal Heir verification and institutional KYC review.',
  },
  {
    q: 'Why can multiple assets across different institutions be discovered for one person?',
    a: 'The matching engine scans all Bank, Insurance, and Mutual Fund registries without stopping at the first result, so savings accounts, fixed deposits, insurance policies, and mutual fund folios are all surfaced together.',
  },
];

export function LandingPage({ onNavigateAuth, onEnterPortal, isAuthenticated }: Props) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    subject: 'Family Asset Discovery Assistance',
    message: '',
  });
  const [contactStatus, setContactStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [submittingContact, setSubmittingContact] = useState(false);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingContact(true);
    setContactStatus(null);
    try {
      const res = await apiRequest<{ message: string }>('/api/contact', {
        method: 'POST',
        body: JSON.stringify(contactForm),
      });
      setContactStatus({ type: 'ok', text: res.message });
      setContactForm({
        name: '',
        email: '',
        subject: 'Family Asset Discovery Assistance',
        message: '',
      });
    } catch (err: any) {
      setContactStatus({ type: 'err', text: err.message || 'Unable to submit inquiry.' });
    } finally {
      setSubmittingContact(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract: Zone 1 Brand — Zone 2 5 single-line nav links — Zone 3 1 primary action */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a href="#top" className="whitespace-nowrap shrink-0">
            <BrandMark />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a href="#problem" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              The Problem
            </a>
            <a href="#workflow" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              How It Works
            </a>
            <a href="#benefits" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              Benefits
            </a>
            <a href="#faq" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              FAQ
            </a>
            <a href="#contact" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              Contact
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            {isAuthenticated && onEnterPortal ? (
              <button
                type="button"
                onClick={onEnterPortal}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3A] rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Open Dashboard
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigateAuth('register')}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3A] rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Discover Unclaimed Assets
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main id="top">
        <section className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-6 py-14 lg:py-20 grid lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
              <div>
                <p className="text-xs font-medium tracking-wide text-teal-800 mb-3">
                  विरासत सेतु · Digital Public Infrastructure for Financial Inheritance
                </p>
                <h1
                  className="font-display font-bold text-slate-950 tracking-tight leading-[1.12] text-balance"
                  style={{ fontSize: 'clamp(2.25rem, 3.8vw, 3.35rem)' }}
                >
                  Connecting death registrations with financial institutions so families never lose rightful assets.
                </h1>
                <p className="mt-5 text-base text-slate-600 leading-relaxed max-w-xl">
                  Over ₹1.1 lakh crore in savings accounts, fixed deposits, insurance policies, and
                  mutual funds sits unclaimed across India simply because families do not know where
                  to look. Virasat Setu bridges verified death records with participating financial
                  registries in one unified workflow.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() =>
                      isAuthenticated && onEnterPortal ? onEnterPortal() : onNavigateAuth('register')
                    }
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 transition-colors whitespace-nowrap"
                  >
                    Discover Unclaimed Assets
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  {!isAuthenticated && (
                    <button
                      type="button"
                      onClick={() => onNavigateAuth('login')}
                      className="px-5 py-3 text-sm font-semibold text-slate-800 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                      Sign In / Demo Accounts
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Discovery & coordination platform only · Institutions retain full custody and legal verification authority.
                </p>
              </div>
            </div>

            <div className="lg:col-span-6 flex">
              <div className="relative w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-900 min-h-[320px]">
                <img
                  src="/src/assets/images/hero_virasat_bridge_1795025606099.jpg"
                  alt="Architectural bridge symbolizing Virasat Setu connecting families and financial registries"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-transparent p-6 text-white">
                  <p className="text-xs font-medium text-teal-300">
                    Unified Discovery Bridge
                  </p>
                  <p className="text-sm font-medium mt-1 max-w-md text-slate-100">
                    One verified death certificate triggers automated screening across banks, insurers, and asset managers.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 4-Column Quantitative Proof Strip */}
          <div className="border-t border-slate-200 bg-slate-50">
            <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 lg:grid-cols-4 gap-8">
              <div>
                <div className="font-mono tabular-nums text-2xl lg:text-3xl font-bold text-[#0B1F3A]">
                  ₹1.1 Lakh Cr
                </div>
                <div className="text-xs font-semibold text-slate-800 mt-1">
                  Total Estimated Unclaimed Assets
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Across Indian banks, insurers, and fund houses
                </div>
              </div>
              <div>
                <div className="font-mono tabular-nums text-2xl lg:text-3xl font-bold text-[#0B1F3A]">
                  ₹42,000+ Cr
                </div>
                <div className="text-xs font-semibold text-slate-800 mt-1">
                  Unclaimed Bank Deposits
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Dormant savings & matured fixed deposits
                </div>
              </div>
              <div>
                <div className="font-mono tabular-nums text-2xl lg:text-3xl font-bold text-[#0B1F3A]">
                  ₹25,000+ Cr
                </div>
                <div className="text-xs font-semibold text-slate-800 mt-1">
                  Unclaimed Insurance Payouts
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Term, endowment, and maturity benefits
                </div>
              </div>
              <div>
                <div className="font-mono tabular-nums text-2xl lg:text-3xl font-bold text-[#0B1F3A]">
                  ₹43,000+ Cr
                </div>
                <div className="text-xs font-semibold text-slate-800 mt-1">
                  Dormant Mutual Funds & Folios
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Unclaimed redemptions & dividend units
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: The Problem */}
        <section id="problem" className="max-w-7xl mx-auto px-6 py-16 lg:py-20">
          <div className="grid lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-5 rounded-lg overflow-hidden border border-slate-200 bg-slate-200 min-h-[280px]">
              <img
                src="/src/assets/images/family_heritage_scene_1795025607204.jpg"
                alt="Family reviewing financial documents together"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="lg:col-span-7 flex flex-col justify-center space-y-5">
              <p className="text-xs font-semibold tracking-wide text-teal-800">
                01. The Fragmentation Gap
              </p>
              <h2 className="font-display text-2xl lg:text-3xl font-bold text-slate-950 tracking-tight text-balance">
                Why families leave rightful inheritance unclaimed
              </h2>
              <p className="text-sm lg:text-base text-slate-600 leading-relaxed">
                When a family member passes away, relatives must manually guess which banks, life
                insurers, or mutual fund houses the deceased person held accounts with, visit
                branches in person, and repeat paperwork across disconnected silos.
              </p>
              <div className="grid sm:grid-cols-2 gap-6 pt-2 border-t border-slate-200">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">No Unified Discovery Trigger</h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Municipal death registrations are never linked to institutional financial
                    ledgers, leaving accounts dormant for decades.
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Strict Institutional Boundaries</h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Virasat Setu does not bypass bank custody or auto-assign ownership; it surfaces
                    weighted candidate matches and coordinates verified claims.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Step-by-Step Workflow */}
        <section id="workflow" className="bg-[#0B1F3A] text-white py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl mb-12">
              <p className="text-xs font-semibold tracking-wide text-teal-300">
                02. How Virasat Setu Works
              </p>
              <h2 className="font-display text-2xl lg:text-3xl font-bold tracking-tight mt-2 text-balance">
                From verified death registration to institutional claim settlement
              </h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  step: '01',
                  title: 'Submit Death Record',
                  desc: 'A family member submits personal details, death certificate reference, claimant info, and supporting documents.',
                },
                {
                  step: '02',
                  title: 'Registry Verification',
                  desc: 'An authorized administrator reviews uploaded certificate proof before the record enters institutional matching.',
                },
                {
                  step: '03',
                  title: 'Weighted Asset Discovery',
                  desc: 'The matching engine scores identity ref (50), name similarity (25), DOB (15), and city/nominee (10) across Bank, Insurance, and MF registries.',
                },
                {
                  step: '04',
                  title: 'Claimant Verification & Claim',
                  desc: 'Nominees or legal heirs complete verification and submit tracked claims directly to the holding institution.',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="bg-slate-900/70 border border-slate-700/80 rounded-lg p-6 flex flex-col justify-between"
                >
                  <div>
                    <div className="font-mono tabular-nums text-xs font-semibold text-amber-400">
                      Step {item.step}
                    </div>
                    <h3 className="font-display text-base font-semibold text-white mt-2">
                      {item.title}
                    </h3>
                    <p className="text-sm text-slate-300 mt-2 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section: Benefits for Families & Institutions */}
        <section id="benefits" className="max-w-7xl mx-auto px-6 py-16 lg:py-20">
          <div className="grid lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-7 grid sm:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                <div className="flex items-center gap-2.5 text-[#0B1F3A]">
                  <Users className="w-5 h-5 text-teal-700" />
                  <h3 className="font-display text-lg font-bold">For Families</h3>
                </div>
                <ul className="space-y-3 text-sm text-slate-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                    <span>Single submission screens bank deposits, insurance policies, and mutual fund folios simultaneously.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                    <span>No guesswork about which branch or institution the deceased used.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                    <span>Privacy-masked alerts via email and in-portal notification center.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                    <span>Step-by-step claim timeline from Submitted to Completed.</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                <div className="flex items-center gap-2.5 text-[#0B1F3A]">
                  <Building2 className="w-5 h-5 text-amber-700" />
                  <h3 className="font-display text-lg font-bold">For Financial Institutions</h3>
                </div>
                <ul className="space-y-3 text-sm text-slate-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>Strict data isolation: representatives access only their own institution’s matches and claims.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>Pre-screened death certificates and verified nominee/legal heir dossiers.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>Faster reduction of RBI DEAF / unclaimed policyholder liabilities.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>Complete audit trail of every status change and document request.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-lg overflow-hidden border border-slate-200 bg-slate-900 min-h-[280px]">
              <img
                src="/src/assets/images/institutional_registry_vault_1795025606810.jpg"
                alt="Institutional banking and insurance registry hall"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </section>

        {/* Section: FAQ & Contact */}
        <section id="faq" className="bg-white border-t border-slate-200 py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-12">
            <div className="lg:col-span-7">
              <p className="text-xs font-semibold tracking-wide text-teal-800">
                03. Frequently Asked Questions
              </p>
              <h2 className="font-display text-2xl font-bold text-slate-950 mt-2 mb-6">
                Governance, privacy, and legal boundaries
              </h2>
              <div className="divide-y divide-slate-200 border-t border-b border-slate-200">
                {FAQS.map((item, idx) => {
                  const isOpen = openFaq === idx;
                  return (
                    <div key={item.q} className="py-4">
                      <button
                        type="button"
                        onClick={() => setOpenFaq(isOpen ? null : idx)}
                        className="w-full flex items-center justify-between gap-4 text-left"
                      >
                        <span className="text-sm font-semibold text-slate-900">{item.q}</span>
                        {isOpen ? (
                          <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                        )}
                      </button>
                      {isOpen && (
                        <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">{item.a}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div id="contact" className="lg:col-span-5">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
                <div className="flex items-center gap-2 text-slate-900">
                  <ShieldCheck className="w-5 h-5 text-teal-700" />
                  <h3 className="font-display text-lg font-bold">Support & Help Desk</h3>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Questions about death record verification or institutional onboarding? Send a message below.
                </p>

                <form onSubmit={handleContactSubmit} className="mt-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      placeholder="e.g., Priya Kumar"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Subject</label>
                    <input
                      type="text"
                      required
                      value={contactForm.subject}
                      onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Message</label>
                    <textarea
                      rows={3}
                      required
                      value={contactForm.message}
                      onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      placeholder="How can our registry desk help?"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                    />
                  </div>

                  {contactStatus && (
                    <p
                      className={`text-xs font-medium ${
                        contactStatus.type === 'ok' ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {contactStatus.text}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submittingContact}
                    className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#0B1F3A] rounded-md hover:bg-slate-800 disabled:opacity-60 transition-colors"
                  >
                    {submittingContact ? 'Submitting...' : 'Submit Inquiry'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="bg-slate-950 text-slate-400 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <BrandMark dark size="sm" />
            <p className="text-xs text-slate-400 mt-2 max-w-md">
              Virasat Setu (विरासत सेतु) is a simulated college project prototype demonstrating unified unclaimed financial asset discovery across death registrations and financial institutions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <a href="#problem" className="hover:text-white">The Problem</a>
            <a href="#workflow" className="hover:text-white">How It Works</a>
            <a href="#benefits" className="hover:text-white">Benefits</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
            <button
              type="button"
              onClick={() => onNavigateAuth('login')}
              className="text-teal-300 hover:text-teal-200 font-medium"
            >
              Portal Sign In
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
