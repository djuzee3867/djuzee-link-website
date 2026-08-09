// Code samples for the visualizer dropdown. Each one is short enough to stay
// well under Python Tutor's 1000-step trace limit and only uses builtins.

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
];

export const DEFAULT_CODE = EXAMPLES[1].code;
