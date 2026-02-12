import re
import os

addresses = {
    '0xbdad6a18619a9df01b762ba826805b1241a688d8': '0xBdAD6A18619A9dF01b762Ba826805B1241A688d8',
    '0x5aa236d9a3f4f3ce095cc0580a09d0e339f8073d': '0x5aA236D9A3F4F3Ce095cc0580a09D0E339F8073D',
    '0x44b1ddd213b8f31673803a556ed6fd9d7044125b': '0x44B1DdD213B8F31673803A556eD6FD9D7044125b',
    '0x08a3830525461795f66416085ddc03c986f37d9b': '0x08a3830525461795F66416085dDc03C986F37d9B',
    '0x9c987b2bfd12dddf97fc6af7e6ffb26eaf9586c7': '0x9C987B2BFD12Dddf97fc6AF7E6FfB26EAF9586c7',
    '0x64cd052e36c6d44ea8c648876bea489c5c2a927d': '0x64CD052E36C6D44EA8C648876Bea489C5C2a927d',
    '0xca1e40a5b0b12d57cdcc252916139aae1bbbe9cb': '0xca1E40A5B0b12d57Cdcc252916139aAE1bBBe9cB',
    '0x79819386b8fc15781ed3f417837b68f8da26223e': '0x79819386B8Fc15781eD3F417837B68F8DA26223e',
    '0xf2f49d7bdf026ce5d8fc4197f86640fd1adb2545': '0xf2F49d7BDF026cE5d8fc4197F86640fd1Adb2545',
    '0xe3023c0305fedee834a7a553dee3bd14042819698': '0xE3023c0305fEdee834A7A553De3BD14042819698',
    '0x256a19ffa31bfde2e053443fe96def88481bae14': '0xcfC2909f46170C97ab5D64167d8cf2f39f53515F'
}

file_path = r'c:\Users\Dream\Downloads\mvi-dapp-complete\frontend\src\config\contracts.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

for lower, checksum in addresses.items():
    content = content.replace(f"'{lower}'", f"'{checksum}'")
    content = content.replace(f'"{lower}"', f'"{checksum}"')

with open(file_path, 'w', encoding='utf-8', newline='') as f:
    f.write(content)

print("Successfully updated addresses in contracts.ts")
