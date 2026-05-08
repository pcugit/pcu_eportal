"use client";

import React, { useState, useEffect } from "react";
import { ApiClient, PaymentTransaction } from "@/lib/api";
import {
  CreditCard,
  ArrowLeft,
  Search,
  Download,
  CheckCircle2,
  Clock,
  ChevronRight,
  TrendingUp,
  ShieldCheck,
  Receipt,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { format } from "date-fns";

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ApiClient.getPaymentHistory();
      setTransactions(data.payment_history || []);
    } catch (err: any) {
      console.error("Failed to fetch payment history", err);
      setError(err.message || "Unable to load transaction history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDownload = async (receipt_no: string) => {
    setDownloading(receipt_no);
    try {
      const blob = await ApiClient.downloadPaymentReceipt(receipt_no);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${receipt_no}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download receipt");
    } finally {
      setDownloading(null);
    }
  };

  const filteredTransactions = transactions.filter(
    (tx) =>
      (tx.payment_type?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (tx.reference_no?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (tx.receipt_no?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (tx.client_name?.toLowerCase() || "").includes(search.toLowerCase()),
  );

  // Pagination logic
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredTransactions.slice(
    indexOfFirstItem,
    indexOfLastItem,
  );

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  if (loading) {
    return (
      <div className="min-h-screen bg-white p-10 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-500 text-sm">Loading transactions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      <div className="max-w-[95%] mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">
            Transaction History
          </h1>
          <p className="text-slate-500 text-sm">
            View and manage your portal payments
          </p>
        </div>

        {/* Content Section */}
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-4 items-center mb-4">
            <div className="relative flex-grow w-full max-w-sm">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <Input
                placeholder="Search..."
                className="pl-10 h-10 bg-white border-slate-200 rounded-md focus:ring-0 focus:border-slate-400"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          {/* Transactions Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase w-10 text-center">
                      #
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">
                      Receipt No
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">
                      Reference No
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase text-center">
                      Amount (₦)
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">
                      Purpose
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {error ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12">
                        <div className="space-y-3">
                          <p className="text-red-500 text-sm">{error}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchHistory}
                            className="text-xs h-8"
                          >
                            Retry
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : currentItems.length > 0 ? (
                    currentItems.map((tx, index) => (
                      <tr
                        key={tx.transaction_id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-4 py-4 text-sm text-slate-500 text-center">
                          {indexOfFirstItem + index + 1}
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm font-mono text-slate-700">
                            {tx.receipt_no || "---"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm font-mono text-slate-600 text-xs">
                            {tx.reference_no || "---"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="text-sm text-slate-700">
                            {tx.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {tx.is_successful ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                              <CheckCircle2 size={14} />
                              Successful
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
                              <X size={14} />
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm text-slate-600 capitalize">
                            {tx.payment_type === "application_fee"
                              ? "Application Form"
                              : tx.payment_type.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-slate-700">
                            {tx.created_at
                              ? format(
                                  new Date(tx.created_at),
                                  "dd/MM/yyyy, h:mm a",
                                )
                              : "---"}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          {tx.is_successful && (
                            <Button
                              onClick={() => handleDownload(tx.receipt_no)}
                              disabled={downloading === tx.receipt_no}
                              variant="outline"
                              className="h-8 px-3 text-xs border-slate-200 hover:bg-slate-50 rounded"
                            >
                              {downloading === tx.receipt_no ? (
                                <div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                              ) : (
                                "Print"
                              )}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="text-center py-12">
                        <p className="text-slate-500 text-sm">
                          {search
                            ? "No matches found for your search"
                            : "No transactions found"}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <div className="text-xs text-slate-500">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  onClick={() => paginate(currentPage - 1)}
                  disabled={currentPage === 1}
                  variant="outline"
                  className="h-8 px-3 text-xs rounded border-slate-200"
                >
                  Previous
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (number) => (
                      <Button
                        key={number}
                        onClick={() => paginate(number)}
                        variant={
                          currentPage === number ? "secondary" : "outline"
                        }
                        className={`h-8 w-8 text-xs p-0 rounded border-slate-200 ${
                          currentPage === number ? "bg-slate-100" : ""
                        }`}
                      >
                        {number}
                      </Button>
                    ),
                  )}
                </div>

                <Button
                  onClick={() => paginate(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  variant="outline"
                  className="h-8 px-3 text-xs rounded border-slate-200"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
