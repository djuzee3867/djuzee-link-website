// Code samples for the visualizer dropdown. Each one is short enough to stay
// well under Python Tutor's 1000-step trace limit. The last three import numpy
// or pandas, downloaded on demand the first time one of them is run; everything
// else, the standard library included, is already there. An entry with a
// dataFile ships that file alongside it and loads it when the sample is picked.

export const EXAMPLES = [
  {
    id: "basics",
    label: "Variables and swap",
    code: `a = 10
b = 25
print("before:", a, b)

a, b = b, a
print("after:", a, b)

total = a + b
print("total:", total)
`,
  },
  {
    id: "loop",
    label: "Loop that builds a list",
    code: `squares = []

for n in range(1, 7):
    squares.append(n * n)
    print(n, "->", n * n)

print("squares:", squares)
print("sum:", sum(squares))
`,
  },
  {
    id: "alias",
    label: "Two names, one list",
    code: `first = [1, 2, 3]
second = first
second.append(4)

print("first:", first)
print("second:", second)

third = first[:]
third.append(99)

print("first:", first)
print("third:", third)
`,
  },
  {
    id: "grid",
    label: "Nested list (grid)",
    code: `grid = []

for row in range(3):
    line = []
    for col in range(3):
        line.append(row * 3 + col)
    grid.append(line)

for line in grid:
    print(line)

print("center:", grid[1][1])
`,
  },
  {
    id: "count",
    label: "Counting with a dict",
    code: `words = ["red", "blue", "red", "green", "blue", "red"]
count = {}

for w in words:
    if w in count:
        count[w] += 1
    else:
        count[w] = 1

print(count)
print("most common:", max(count, key=count.get))
`,
  },
  {
    id: "sort",
    label: "Bubble sort",
    code: `nums = [5, 2, 9, 1, 6]

for i in range(len(nums)):
    for j in range(len(nums) - 1 - i):
        if nums[j] > nums[j + 1]:
            nums[j], nums[j + 1] = nums[j + 1], nums[j]
    print("pass", i + 1, nums)

print("sorted:", nums)
`,
  },
  {
    id: "recursion",
    label: "Recursion and the call stack",
    code: `def total(items):
    if not items:
        return 0
    return items[0] + total(items[1:])

print(total([1, 2, 3, 4]))
`,
  },
  {
    id: "class",
    label: "Class with two objects",
    code: `class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount
        return self.balance

a = Account("ann", 100)
b = Account("bob")

a.deposit(50)
b.deposit(20)

print(a.balance, b.balance)
`,
  },
  {
    id: "linked",
    label: "Linked list of nodes",
    code: `class Node:
    def __init__(self, value):
        self.value = value
        self.next = None

head = Node("a")
head.next = Node("b")
head.next.next = Node("c")

node = head
while node is not None:
    print(node.value)
    node = node.next
`,
  },
  {
    id: "input",
    label: "Reading input()",
    code: `age = int(input("How old are you? "))
left = 18 - age

if left > 0:
    print("You turn 18 in", left, "years")
else:
    print("You are already 18 or older")
`,
  },
  {
    id: "stdlib",
    label: "Imports from the standard library",
    code: `from collections import Counter
from dataclasses import dataclass
from functools import reduce

@dataclass
class Point:
    x: int
    y: int

letters = Counter("banana")
corners = [Point(0, 0), Point(3, 4)]
span = reduce(lambda a, b: a + b, [p.x for p in corners])

print(letters)
print(corners[1], "span:", span)
`,
  },
  {
    id: "numpy-slice",
    label: "numpy: slicing and views",
    code: `import numpy as np

a = np.arange(12).reshape(3, 4)
window = a[1:, 1:3]
a[a > 8] = 0

print("window:", window.tolist())
print("column means:", a.mean(axis=0).tolist())
`,
  },
  {
    id: "pandas-frame",
    label: "pandas: filter and group",
    code: `import pandas as pd

df = pd.DataFrame({
    "team": ["a", "b", "a", "b", "a"],
    "score": [10, 7, 13, 9, 5],
})

scores = df["score"]
best = df[df["score"] > 8]
df["bonus"] = df["score"] * 2

print(df.groupby("team")["score"].mean())
`,
  },
  {
    id: "pandas-csv",
    label: "pandas: read a CSV file",
    // ships with the page and is written into Pyodide's filesystem when this
    // example is picked, so the sample runs without anyone dropping a file first
    dataFile: "sales.csv",
    code: `import pandas as pd

sales = pd.read_csv("sales.csv")
sales["revenue"] = sales["units"] * sales["price"]

by_region = sales.groupby("region")["revenue"].sum()
busy = sales[sales["units"] > 10]

print(by_region)
print(busy[["region", "product", "units"]])
`,
  },
];
