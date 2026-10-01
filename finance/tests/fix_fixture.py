with open('e:/TechTrekGT/finance/tests/calculation-engine.test.js', 'r') as f:
    content = f.read()

old = "payDay1: '1st',\n      payDay2: '15th',\n      payOffsetDays: 0\n    }],"
new = "payDay1: '1st',\n      payDay2: '15th',\n      payOffsetDays: 0,\n      netPerPay: 1378.00\n    }],"

if old in content:
    content = content.replace(old, new, 1)
    with open('e:/TechTrekGT/finance/tests/calculation-engine.test.js', 'w') as f:
        f.write(content)
    print('Fixed test fixture')
else:
    print('Pattern not found')
