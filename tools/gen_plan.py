#!/usr/bin/env python3
"""Generates plan.json — the day-by-day study roadmap.

Run:  python3 tools/gen_plan.py
To extend the plan, add entries to WEEKS (each starts on a Monday) and re-run.
Task ids are date-based, so existing ticks survive regeneration as long as you
don't reorder the tasks inside days that already happened.
"""
import json
from datetime import date, timedelta
from pathlib import Path

L = {
    "neetcode": "https://neetcode.io/practice",
    "bakhvalov": "https://github.com/dendibakh/perf-book",
    "drepper": "https://people.freebsd.org/~lstewart/articles/cpumemory.pdf",
    "agner": "https://www.agner.org/optimize/",
    "gbench": "https://github.com/google/benchmark",
    "perf": "https://www.brendangregg.com/perf.html",
    "flame": "https://www.brendangregg.com/flamegraphs.html",
    "use": "https://www.brendangregg.com/usemethod.html",
    "hdr": "https://github.com/HdrHistogram/HdrHistogram_c",
    "godbolt": "https://godbolt.org",
    "itch": "https://www.nasdaqtrader.com/content/technicalsupport/specifications/dataproducts/NQTVITCHspecification.pdf",
    "lmax": "https://martinfowler.com/articles/lmax.html",
    "boehm": "https://siboehm.com/articles/22/CUDA-MMM",
    "brrr": "https://horace.io/brrr_intro.html",
    "cudabp": "https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/",
    "colab": "https://colab.research.google.com",
    "lemire": "https://lemire.me/blog/",
    "toplev": "https://github.com/andikleen/pmu-tools",
    "preshing_lf": "https://preshing.com/20120612/an-introduction-to-lock-free-programming/",
    "preshing_cto": "https://preshing.com/20120625/memory-ordering-at-compile-time/",
    "preshing_ar": "https://preshing.com/20120913/acquire-and-release-semantics/",
    "preshing_sw": "https://preshing.com/20130823/the-synchronizes-with-relation/",
    "meetup": "https://www.meetup.com/cpplondon/",
    "includecpp": "https://www.includecpp.org",
    "gpumode": "https://www.gpumode.com",
    "cpponline": "https://cpponline.uk",
    "accu": "https://accuonsea.uk",
    "adc": "https://audio.dev",
    "carruth": "https://www.youtube.com/results?search_query=chandler+carruth+tuning+c%2B%2B+benchmarks+cpus+compilers",
    "pikus": "https://www.youtube.com/results?search_query=fedor+pikus+branchless+programming+cppcon",
    "carruth2": "https://www.youtube.com/results?search_query=chandler+carruth+efficiency+with+algorithms+performance+with+data+structures",
}

ALGO_DETAIL = ("From the NeetCode 150 list. Weeks 1–3: untimed, focus on the pattern. "
               "From week 4: 25-minute cap, then read the solution. Log every miss "
               "(problem, what you missed, the pattern) — that log drives Sunday review.")

# ---------------------------------------------------------------------------
# Weekly content. work = 5 reading items (Mon–Fri, ~1h at your desk, input only)
# benchA = Tue home build/measure, benchB = Thu, sat / sun = weekend blocks.
# algo = (topic, [Mon, Tue, Wed, Thu, Fri, Sun] new-problem counts)
# ---------------------------------------------------------------------------
WEEKS = [
    dict(theme="Measurement rig", phase=1,
         goal="A quiet, repeatable benchmarking setup and a known noise floor.",
         work=[("Effective Modern C++ — Items 1–4 (type deduction)", None),
               ("Effective Modern C++ — Items 5–6 (auto)", None),
               ("Effective Modern C++ — Items 7–10 (braces, nullptr, aliases, enums)", None),
               ("Effective Modern C++ — Items 11–14 (deleted fns, override, const_iterator, noexcept)", None),
               ("Bakhvalov, Performance Analysis & Tuning — Ch. 1–2 (measuring performance)", "bakhvalov")],
         benchA=("Install the toolchain: perf, Google Benchmark, CMake; build a Release -O2 -g template project",
                 "Personal machine only. A Linux box (or WSL2 if you must — note perf counters are limited there).", "gbench"),
         benchB=("Stabilise measurements: taskset pinning, disable turbo/frequency scaling, find your noise floor",
                 "Run an empty benchmark 30 times; record min/median/max. That spread is your noise floor — any 'improvement' smaller than it is noise.", "perf"),
         sat=("Turn the template into a reusable bench repo: run script with pinning, records CPU model, kernel, compiler & flags with every result",
              "Keep it private for now. This rig is what everything else in the year stands on."),
         sun=("perf stat on a toy program — read cycles, instructions, IPC, cache-misses", "perf"),
         algo=("Arrays & Hashing", [2, 2, 2, 1, 1, 1]),
         people=("Join the C++ London meetup and #include <C++>; note the next meetup date",
                 "Also draft how you'll ask your manager for an hour a day of structured learning — raise it at your next 1:1.", "meetup")),

    dict(theme="Memory hierarchy", phase=1,
         goal="Measured L1/L2/L3/DRAM latencies and bandwidth on your own machine.",
         work=[("Effective Modern C++ — Items 15–17 (constexpr, const member fns, special members)", None),
               ("Effective Modern C++ — Items 18–22 (smart pointers, pimpl)", None),
               ("Drepper, What Every Programmer Should Know About Memory — §2 (RAM)", "drepper"),
               ("Drepper — §3 (CPU caches)", "drepper"),
               ("Bakhvalov — CPU microarchitecture chapter", "bakhvalov")],
         benchA=("Pointer-chasing latency benchmark: random cyclic list over working sets from 4 KB to 256 MB", None, None),
         benchB=("Plot latency vs working-set size; mark the L1/L2/L3/DRAM steps and compare with lscpu",
                 "Write the numbers into your log. These are your answers to every 'how expensive is a cache miss' question.", None),
         sat=("Bandwidth & stride: sequential vs random vs strided (1, 16, 64, 4096 bytes) access",
              "Explain each result in a sentence. Prefetcher, cache line, page — which one is each curve showing?"),
         sun=("Write a private note 'My machine's memory numbers' with the table", None),
         algo=("Two Pointers → Sliding Window", [2, 2, 1, 1, 1, 1]),
         people=("Check your employer's policy on publishing, conference talks and open source",
                 "Note what needs sign-off and who approves it. Do this before you publish anything under your own name.", None)),

    dict(theme="Cache lines & false sharing", phase=1,
         goal="Prove false sharing and data-layout effects with your own numbers.",
         work=[("Effective Modern C++ — Items 23–26 (move, forward, universal references)", None),
               ("Effective Modern C++ — Items 27–30 (overloading on universal refs, perfect forwarding)", None),
               ("Drepper — §6.4 (multi-thread optimisations)", "drepper"),
               ("Preshing — An Introduction to Lock-Free Programming + Memory Ordering at Compile Time", "preshing_lf"),
               ("Bakhvalov — terminology & metrics chapter", "bakhvalov")],
         benchA=("False sharing: two threads incrementing adjacent counters vs alignas(64) counters", None, None),
         benchB=("Scale 1→N threads and confirm with perf c2c or cache-miss counters; record numbers", None, "perf"),
         sat=("AoS vs SoA: sum one field across 10M structs; vary struct size; measure", None),
         sun=("Add the false-sharing and AoS/SoA results to your numbers note", None),
         algo=("Sliding Window → Stack", [2, 2, 2, 1, 1, 1]),
         people=("Register for the next C++ London meetup; get on 3–4 firm-hosted tech-talk mailing lists",
                 "Firm events are free and the room is full of future interviewers.", "meetup")),

    dict(theme="Branches & IPC", phase=1,
         goal="Understand and measure branch misprediction; read perf record output fluently.",
         work=[("Effective Modern C++ — Items 31–34 (lambdas)", None),
               ("Effective Modern C++ — Items 35–37 (threads, async, joinability)", None),
               ("Effective Modern C++ — Items 38–40 (futures, condvars, atomic vs volatile)", None),
               ("Bakhvalov — 'power tools' / profiling chapter (sampling, perf record)", "bakhvalov"),
               ("Agner Fog, Optimizing software in C++ — branch prediction & jump sections", "agner")],
         benchA=("Branch misprediction: sum values above a threshold, sorted vs unsorted input; perf stat -e branch-misses", None, None),
         benchB=("Make it branchless; compare timings and read the asm in Compiler Explorer", None, "godbolt"),
         sat=("perf record + flame graph of a real program; learn perf annotate", "Your bench repo or any open-source tool you use.", ),
         sun=("Flame-graph reading drill: explain the top 3 frames of your profile in writing", "flame"),
         algo=("Stack → Binary Search", [2, 2, 2, 1, 1, 1]),
         people=("ADC (9–11 Nov, Bristol) is next week — decide: take leave, or plan to watch talks online",
                 "Audio is hard-real-time C++; the crowd overlaps heavily with low-latency people.", "adc")),

    dict(theme="Syscalls, TLB & allocation", phase=1,
         goal="Know what a syscall, a TLB miss and an allocation cost — measured, not quoted.",
         work=[("Effective Modern C++ — Items 41–42 (finish the book)", None),
               ("CSAPP Ch. 6 — memory hierarchy §6.1–6.3", None),
               ("CSAPP Ch. 6 — §6.4–6.6 (caches, cache-friendly code)", None),
               ("CSAPP Ch. 9 — virtual memory §9.1–9.6", None),
               ("CSAPP Ch. 9 — §9.7–9.9 (case study, mmap, dynamic allocation)", None)],
         benchA=("Cost of a syscall, clock_gettime (vDSO) and a context switch (pipe ping-pong)", None, None),
         benchB=("TLB: random access over 1 GB, 4 KB pages vs huge pages (madvise); perf stat dTLB-load-misses", None, None),
         sat=("Allocation: new/delete vs arena/object pool for 10M small objects; report p50/p99/p99.9 with HdrHistogram",
              "Never report averages for latency. Percentiles only."),
         sun=("Consolidate your numbers table — everything measured so far, one page", None),
         algo=("Linked List", [2, 2, 2, 1, 1, 1]),
         people=("Watch one ADC talk; note one speaker or author worth following", None, "adc")),

    dict(theme="Sampling week A — trading", phase=1,
         goal="Taste low-latency trading: a correct toy order book. Notice how much you enjoy it.",
         work=[("Harris, Trading and Exchanges — Ch. 1–2", None),
               ("Harris — Ch. 3–4 (orders and order properties)", None),
               ("Harris — Ch. 5–6 (market structures, order-driven markets)", None),
               ("NASDAQ TotalView-ITCH 5.0 spec — §1–4 (print it)", "itch"),
               ("Fowler — The LMAX Architecture", "lmax")],
         benchA=("Design a limit order book on paper: price levels, FIFO queues, cancel-by-id", None, None),
         benchB=("Implement add + cancel (std::map + std::list is fine); unit tests", "Correctness first. Zero optimisation this week.", None),
         sat=("Matching: limit & market orders, price-time priority, partial fills; tests", None),
         sun=("Throughput & per-op p99 for 1M random orders. Then score enjoyment 1–10 and write why", None),
         algo=("Linked List → Trees", [2, 2, 1, 1, 1, 1]),
         people=("Message one engineer whose talk or post you used — ask one specific question",
                 "Specific beats flattering. Never open with a referral request.", None)),

    dict(theme="Sampling week B — GPU", phase=1,
         goal="Taste GPU work: naive vs tiled matmul vs cuBLAS. Compare enjoyment with week A.",
         work=[("Programming Massively Parallel Processors — Ch. 1–3", None),
               ("PMPP — Ch. 4 (compute architecture & scheduling)", None),
               ("PMPP — Ch. 5 (memory architecture & data locality)", None),
               ("CUDA C++ Best Practices Guide — memory optimisations section", "cudabp"),
               ("Horace He — Making Deep Learning Go Brrrr From First Principles", "brrr")],
         benchA=("Get a GPU: your own NVIDIA card or free Colab T4; run a vector-add kernel timed with cudaEvent", None, "colab"),
         benchB=("Naive matmul kernel; verify against a CPU reference", None, None),
         sat=("Tiled shared-memory matmul; GFLOPS vs naive vs cuBLAS for N = 256…4096", None),
         sun=("Read Boehm's matmul post to kernel 3; score enjoyment 1–10 and compare with week A", "boehm"),
         algo=("Trees", [2, 2, 1, 1, 1, 1]),
         people=("Join GPU MODE; lurk and watch one lecture", "Meeting C++ (Berlin) runs 26–28 Nov — talks appear online later.", "gpumode")),

    dict(theme="Memory model & lock-free", phase=1,
         goal="A correct, measured SPSC ring buffer — useful in both forks.",
         work=[("C++ Concurrency in Action — Ch. 5 (memory model) part 1", None),
               ("C++ Concurrency in Action — Ch. 5 part 2 (orderings)", None),
               ("Preshing — Acquire and Release Semantics", "preshing_ar"),
               ("Preshing — The Synchronizes-With Relation", "preshing_sw"),
               ("C++ Concurrency in Action — Ch. 7 (lock-free data structures) part 1", None)],
         benchA=("Implement an SPSC ring buffer with std::atomic acquire/release; tests", None, None),
         benchB=("Benchmark it between two pinned cores vs a mutex + condition_variable queue", None, None),
         sat=("Optimise one change at a time: pad head/tail, cache the remote index, power-of-two masking",
              "Measure after each single change. Write down what each bought."),
         sun=("Run under ThreadSanitizer; write private notes on what each change bought", None),
         algo=("Tries → Heap / Priority Queue", [2, 2, 1, 1, 1, 1]),
         people=("Draft a 5-minute lightning talk outline from your measured numbers", "Working title: 'What my machine actually costs'.", None)),

    dict(theme="SIMD & optimising code", phase=1,
         goal="Read compiler output; know when auto-vectorisation works and when to hand-roll.",
         work=[("CSAPP Ch. 5 — optimising program performance §5.1–5.7", None),
               ("CSAPP Ch. 5 — §5.8–5.15", None),
               ("Lemire's blog — two SIMD posts of your choice", "lemire"),
               ("Agner Fog, Optimizing C++ — vectorisation section", "agner"),
               ("C++ Concurrency in Action — Ch. 7 part 2", None)],
         benchA=("Check auto-vectorisation of sum/dot-product with -O3 -march=native -fopt-info-vec; read the asm", None, "godbolt"),
         benchB=("Hand-write the AVX2 intrinsics version; compare", None, None),
         sat=("SIMD on a real task: integer parsing or CSV field splitting; report GB/s scalar vs SIMD", None),
         sun=("Write up what the compiler did and didn't vectorise, and why", None),
         algo=("Heap → Backtracking", [2, 2, 1, 1, 1, 1]),
         people=("Note C++Online (March) and ACCU on Sea (June) ticket/lightning-talk dates in your calendar", None, "cpponline")),

    dict(theme="Profiling methodology", phase=1,
         goal="Top-down analysis on your own code, and a first fix driven by measurement.",
         work=[("Bakhvalov — Top-Down Microarchitecture Analysis chapter", "bakhvalov"),
               ("Gregg, Systems Performance — Ch. 2 (methodologies)", "use"),
               ("Gregg, Systems Performance — Ch. 6 (CPUs), first half", None),
               ("Gregg's blog — flame graphs & the USE method", "flame"),
               ("Bakhvalov — CPU back-end optimisation chapter", "bakhvalov")],
         benchA=("Top-down analysis of your week-6 order book with perf / toplev; which bound dominates?", None, "toplev"),
         benchB=("Fix the biggest bottleneck (flat price-level array or pool allocator); remeasure", None, None),
         sat=("Draft writeup #1: 'What my machine costs' — latency table, false sharing, branches, TLB", None),
         sun=("Finish the draft; check it against your employer's sign-off rules", None),
         algo=("Graphs", [2, 2, 1, 1, 1, 1]),
         people=("Second outreach message: one engineer, one specific question", None, None)),

    dict(theme="Christmas — light week", phase=1, light=True,
         goal="Keep the habit alive; rest properly.",
         work=[("CppCon talk: Chandler Carruth — Efficiency with Algorithms, Performance with Data Structures", "carruth2"),
               ("CppCon talk: Fedor Pikus — branchless programming", "pikus"),
               ("Optional: skim your numbers note and your miss log", None),
               None, None],
         benchA=None, benchB=None, sat=None,
         sun=("Quarter look-back: what's done, what slipped, what to cut", None),
         algo=("Graphs", [1, 1, 0, 0, 0, 0]),
         people=None,
         rest={3, 4, 5}),  # Thu 24, Fri 25, Sat 26

    dict(theme="New Year — consolidate", phase=1, light=True,
         goal="Spaced repetition on everything you missed; publish writeup #1.",
         work=[("CppCon talk: Chandler Carruth — Tuning C++: Benchmarks, CPUs and Compilers", "carruth"),
               ("Re-read your miss log; pick the 10 worst problems for re-solving", None),
               ("Optional: PMPP Ch. 6 or Harris Ch. 7 — whichever you scored higher", None),
               None,
               ("Optional: skim Gregg Ch. 7 (memory)", None)],
         benchA=None, benchB=("Re-run every microbenchmark; confirm the numbers reproduce", None, None),
         sat=("Publish writeup #1 (once signed off) — blog or GitHub README", "A published thing is worth ten private ones."),
         sun=("Plan next quarter's reading; list what to carry over", None),
         algo=("Spaced repetition — re-solve past misses", [2, 2, 0, 1, 0, 1]),
         people=None,
         rest={4}),  # Fri 1 Jan

    dict(theme="Phase 1 checkpoint", phase=1,
         goal="~90 problems, a full numbers table, one published writeup, a leaning between the forks.",
         work=[("C++ Concurrency in Action — Ch. 8 (designing concurrent code)", None),
               ("Bakhvalov — remaining chapter of your choice", "bakhvalov"),
               ("Harris Ch. 7 or PMPP Ch. 6 — whichever sampling week you scored higher", None),
               ("Kleppmann, DDIA — Ch. 1 (only if big tech is on your list)", None),
               ("Gregg, Systems Performance — Ch. 7 (memory), first half", None)],
         benchA=("Timed mock: 2 medium problems in 50 minutes, talking out loud", None, None),
         benchB=("Retro on the order book or matmul: what would you build next if you picked that fork?", None, None),
         sat=("Checkpoint: problems solved, numbers table, writeup, enjoyment scores — write one honest page", None),
         sun=("Extend this roadmap: ask Claude to generate the next 13 weeks", None),
         algo=("1-D Dynamic Programming", [2, 2, 2, 1, 1, 1]),
         people=("Lightning talk: submit to a meetup or C++Online, or give it internally first", None, "cpponline")),
]

START = date(2026, 10, 12)  # Monday, week 1


def T(slot, kind, title, mins, detail=None, link=None):
    t = dict(slot=slot, kind=kind, title=title, mins=mins)
    if detail:
        t["detail"] = detail
    if link:
        t["link"] = L.get(link, link)
    return t


def algo(topic, n, mins):
    if n <= 0:
        return None
    word = "problem" if n == 1 else "problems"
    if topic.startswith("Spaced"):
        t = T("home", "algo", f"Re-solve {n} past {word} from your miss log", mins,
              "Pick the ones you failed hardest. Solve cold, timed, without looking at your notes.", "neetcode")
        t["n"], t["fresh"] = n, False
        return t
    t = T("home", "algo", f"{topic}: solve {n} new {word}", mins, ALGO_DETAIL, "neetcode")
    t["n"], t["fresh"] = n, True
    return t


def build_days():
    days = {}
    # Day 0 — tonight
    days["2026-10-11"] = dict(week=0, focus="Orientation", tasks=[
        T("home", "admin", "Bookmark this site on your phone and laptop", 5),
        T("home", "admin", "Check GitHub notification emails are on, and watch the study-roadmap repo", 5,
          "Settings → Notifications → Email. The daily reminder arrives as a GitHub issue assigned to you."),
        T("home", "admin", "Order Effective Modern C++; print Bakhvalov Ch. 1–2", 10, None, "bakhvalov"),
        T("home", "admin", "Start your miss log and achievements log (a notes app or a private doc)", 10,
          "Achievements log: work wins with numbers attached, written while fresh."),
    ])

    for wi, w in enumerate(WEEKS):
        monday = START + timedelta(weeks=wi)
        rest = w.get("rest", set())
        counts = w["algo"][1]
        topic = w["algo"][0]
        for di in range(7):
            d = monday + timedelta(days=di)
            key = d.isoformat()
            tasks = []
            if di in rest:
                days[key] = dict(week=wi + 1, focus="Rest day", rest=True, tasks=[])
                continue
            if di < 5:
                rd = w["work"][di]
                if rd:
                    title, link = rd
                    tasks.append(T("work", "read", title, 60 if not w.get("light") else 40,
                                   "Input only: read, take one page of notes in your own words.", link))
                if di == 0:  # Mon
                    tasks += [algo(topic, counts[0], 60),
                              T("home", "review", "Review last week's misses; re-solve one from memory", 15)]
                elif di == 1:  # Tue
                    tasks.append(algo(topic, counts[1], 45))
                    if w["benchA"]:
                        b = w["benchA"]
                        tasks.append(T("home", "build", b[0], 45, b[1], b[2]))
                elif di == 2:  # Wed
                    tasks.append(algo(topic, counts[2], 60))
                    if not w.get("light"):
                        tasks.append(T("home", "review", "Spaced repetition: re-solve one earlier miss", 15))
                elif di == 3:  # Thu
                    if w["benchB"]:
                        b = w["benchB"]
                        tasks.append(T("home", "build", b[0], 45, b[1], b[2]))
                    tasks.append(algo(topic, counts[3], 30))
                elif di == 4:  # Fri
                    tasks.append(algo(topic, counts[4], 30))
                    if w["people"]:
                        p = w["people"]
                        tasks.append(T("home", "people", p[0], 30, p[1], p[2]))
            elif di == 5:  # Sat
                if w["sat"]:
                    s = w["sat"]
                    tasks.append(T("weekend", "build", s[0], 120, s[1] if len(s) > 1 else None))
            else:  # Sun
                s = w["sun"]
                tasks.append(T("weekend", "build" if not w.get("light") else "review", s[0], 60, None, s[1]))
                a = algo(topic, counts[5], 45)
                if a:
                    a["slot"] = "weekend"
                    tasks.append(a)
                tasks.append(T("weekend", "review", "Weekly review: tick-off rate, hours, what to change next week", 15))
            tasks = [t for t in tasks if t]
            days[key] = dict(week=wi + 1, focus=w["theme"], tasks=tasks)

    for key, day in days.items():
        for i, t in enumerate(day["tasks"]):
            t["id"] = f"{key}-{i}"
    return days


def main():
    days = build_days()
    weeks = []
    for wi, w in enumerate(WEEKS):
        weeks.append(dict(n=wi + 1, start=(START + timedelta(weeks=wi)).isoformat(),
                          theme=w["theme"], goal=w["goal"], phase=w["phase"]))
    plan = dict(
        title="Study roadmap",
        start="2026-10-11",
        end=max(days),
        target="2027-10-11",
        phases=[dict(n=1, name="Foundations", months="1–3",
                     summary="Measurement rig, memory & CPU fundamentals, modern C++, ~90 algorithm problems, both forks sampled."),
                dict(n=2, name="Build", months="4–8", summary="Coming next: the flagship project or open-source work."),
                dict(n=3, name="Convert", months="9–11", summary="Harder algorithms, domain prep, mocks, publish."),
                dict(n=4, name="Apply", months="12", summary="Second-choice firms first.")],
        weeks=weeks,
        days=days,
    )
    out = Path(__file__).resolve().parent.parent / "plan.json"
    out.write_text(json.dumps(plan, indent=1, ensure_ascii=False))
    mins = sum(t["mins"] for d in days.values() for t in d["tasks"])
    print(f"{len(days)} days, {sum(len(d['tasks']) for d in days.values())} tasks, {mins/60:.0f} h -> {out}")
    for wi in range(len(WEEKS)):
        mon = START + timedelta(weeks=wi)
        wm = sum(t["mins"] for k, d in days.items() if mon.isoformat() <= k < (mon + timedelta(days=7)).isoformat() for t in d["tasks"])
        probs = sum(t["n"] for k, d in days.items()
                    if mon.isoformat() <= k < (mon + timedelta(days=7)).isoformat()
                    for t in d["tasks"] if t.get("fresh"))
        print(f"  W{wi+1:2d} {mon}  {wm/60:4.1f} h  {probs:2d} problems  {WEEKS[wi]['theme']}")


if __name__ == "__main__":
    main()
